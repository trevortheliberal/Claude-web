package app.fslyrics;

import android.service.notification.NotificationListenerService;

/**
 * Empty on purpose. Android only hands out other apps' media sessions
 * (Apple Music's included) to apps that hold notification-listener access,
 * and that access is granted to a service like this one.
 */
public class MediaListener extends NotificationListenerService {
}
