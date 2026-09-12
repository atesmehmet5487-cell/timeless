/**
 * Bildirim katmanı.
 *
 * Üç kabuk, tek arayüz:
 *  - Android (Capacitor LocalNotifications): işletim sistemine zamanlanır,
 *    uygulama kapalıyken de çıkar.
 *  - Windows (Electron): main process'teki zamanlayıcıya verilir; pencere
 *    kapalı olsa bile tepside çalışmaya devam eder.
 *  - Tarayıcı: yalnızca sekme açıkken çalışır (setTimeout). Bu sınır
 *    kullanıcıya Ayarlar ekranında açıkça yazılır.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { delayMs, reminderAt, type Reminder } from '../domain/reminders';
import { platformKind } from './platform';

export type PermissionState = 'granted' | 'denied' | 'unsupported' | 'default';

/** Bildirimdeki "Ödendi" düğmesinin eylem türü (Android). */
export const PAYMENT_ACTION_TYPE = 'PAYMENT_ITEM';

export interface Notifier {
  /** Bu kabukta uygulama kapalıyken de bildirim çıkar mı? */
  readonly worksWhenClosed: boolean;
  permission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  /** Önceki zamanlamaları temizleyip verilen listeyi kurar. */
  schedule(reminders: Reminder[]): Promise<void>;
  cancelAll(): Promise<void>;
  /** Hemen bildirim gösterir (test düğmesi ve anlık uyarılar için). */
  notifyNow(title: string, body: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Tarayıcı / Electron renderer                                        */
/* ------------------------------------------------------------------ */

class WebNotifier implements Notifier {
  readonly worksWhenClosed = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  private supported(): boolean {
    return typeof Notification !== 'undefined';
  }

  async permission(): Promise<PermissionState> {
    if (!this.supported()) return 'unsupported';
    return Notification.permission as PermissionState;
  }

  async requestPermission(): Promise<PermissionState> {
    if (!this.supported()) return 'unsupported';
    return (await Notification.requestPermission()) as PermissionState;
  }

  async schedule(reminders: Reminder[]): Promise<void> {
    await this.cancelAll();
    if ((await this.permission()) !== 'granted') return;

    const now = new Date();
    for (const reminder of reminders) {
      const delay = delayMs(reminder, now);
      // setTimeout 32 bitlik sınırı aşamaz (~24.8 gün)
      if (delay <= 0 || delay > 2_147_483_000) continue;
      this.timers.push(
        setTimeout(() => {
          void this.notifyNow(reminder.title, reminder.body);
        }, delay),
      );
    }
  }

  async cancelAll(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  async notifyNow(title: string, body: string): Promise<void> {
    if ((await this.permission()) !== 'granted') return;
    new Notification(title, { body, tag: 'timeless', icon: undefined });
  }
}

/* ------------------------------------------------------------------ */
/* Android — Capacitor LocalNotifications                              */
/* ------------------------------------------------------------------ */

/** Kimlik metni → Android'in beklediği 32 bitlik pozitif sayı. */
export function numericId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000;
}

class CapacitorNotifier implements Notifier {
  readonly worksWhenClosed = true;

  private map(state: string): PermissionState {
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'denied';
    return 'default';
  }

  async permission(): Promise<PermissionState> {
    return this.map((await LocalNotifications.checkPermissions()).display);
  }

  async requestPermission(): Promise<PermissionState> {
    return this.map((await LocalNotifications.requestPermissions()).display);
  }

  async schedule(reminders: Reminder[]): Promise<void> {
    await this.cancelAll();
    if ((await this.permission()) !== 'granted') return;

    const now = new Date();
    const notifications = reminders
      .filter((r) => delayMs(r, now) > 0)
      .map((r) => ({
        id: numericId(r.id),
        title: r.title,
        body: r.body,
        // allowWhileIdle: pil tasarrufu modunda da zamanında çıksın
        schedule: { at: reminderAt(r), allowWhileIdle: true },
        // Bildirimden doğrudan "Ödendi" işaretlenebilsin
        actionTypeId: r.kind === 'item' ? PAYMENT_ACTION_TYPE : undefined,
        extra: {
          reminderId: r.id,
          date: r.date,
          paymentId: r.paymentId,
          originalDate: r.originalDate,
        },
      }));

    if (notifications.length > 0) await LocalNotifications.schedule({ notifications });
  }

  async cancelAll(): Promise<void> {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) await LocalNotifications.cancel(pending);
  }

  async notifyNow(title: string, body: string): Promise<void> {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericId(`now|${Date.now()}`),
          title,
          body,
          schedule: { at: new Date(Date.now() + 400) },
        },
      ],
    });
  }
}

/* ------------------------------------------------------------------ */
/* Windows — Electron main process                                     */
/* ------------------------------------------------------------------ */

interface ElectronBridge {
  scheduleReminders(reminders: Reminder[]): Promise<void>;
  notifyNow(title: string, body: string): Promise<void>;
  cancelReminders(): Promise<void>;
}

class ElectronNotifier implements Notifier {
  readonly worksWhenClosed = true;

  private bridge(): ElectronBridge | null {
    const api = (window as unknown as { timeless?: { notify?: ElectronBridge } }).timeless;
    return api?.notify ?? null;
  }

  async permission(): Promise<PermissionState> {
    return this.bridge() ? 'granted' : 'unsupported';
  }

  async requestPermission(): Promise<PermissionState> {
    return this.permission();
  }

  async schedule(reminders: Reminder[]): Promise<void> {
    await this.bridge()?.scheduleReminders(reminders);
  }

  async cancelAll(): Promise<void> {
    await this.bridge()?.cancelReminders();
  }

  async notifyNow(title: string, body: string): Promise<void> {
    await this.bridge()?.notifyNow(title, body);
  }
}

let instance: Notifier | null = null;

export function getNotifier(): Notifier {
  if (!instance) {
    const kind = platformKind();
    instance =
      kind === 'android'
        ? new CapacitorNotifier()
        : kind === 'electron'
          ? new ElectronNotifier()
          : new WebNotifier();
  }
  return instance;
}

/** İzin durumunun Türkçe karşılığı. */
export const PERMISSION_LABELS: Record<PermissionState, string> = {
  granted: 'Bildirimler açık',
  denied: 'Bildirim izni reddedildi',
  default: 'Bildirim izni henüz verilmedi',
  unsupported: 'Bu kabukta bildirim yok',
};

/* ------------------------------------------------------------------ */
/* Bildirim üzerinden işlem (Android)                                  */
/* ------------------------------------------------------------------ */

export interface NotificationHandlers {
  /** Bildirimdeki "Ödendi" düğmesine basıldı. */
  onMarkPaid(paymentId: string, originalDate: string): void;
  /** Bildirime dokunuldu — uygulama o güne açılır. */
  onOpen(date: string): void;
}

/**
 * Bildirimdeki hızlı işlemleri kaydeder.
 * Yalnızca Android'de anlamlı; diğer kabuklarda sessizce hiçbir şey yapmaz.
 */
export async function registerNotificationActions(
  handlers: NotificationHandlers,
): Promise<void> {
  if (platformKind() !== 'android') return;

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: PAYMENT_ACTION_TYPE,
        actions: [{ id: 'markPaid', title: 'Ödendi' }],
      },
    ],
  });

  await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = (event.notification.extra ?? {}) as {
      date?: string;
      paymentId?: string;
      originalDate?: string;
    };
    if (event.actionId === 'markPaid' && extra.paymentId && extra.originalDate) {
      handlers.onMarkPaid(extra.paymentId, extra.originalDate);
      return;
    }
    if (extra.date) handlers.onOpen(extra.date);
  });
}
