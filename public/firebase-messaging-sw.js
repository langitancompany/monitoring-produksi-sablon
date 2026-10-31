// public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAkYsPPuWL_h6Dyp_mLGR1TKgVw4RnqKPg",
  authDomain: "notifikasi-lco-superapp.firebaseapp.com",
  projectId: "notifikasi-lco-superapp",
  storageBucket: "notifikasi-lco-superapp.firebasestorage.app",
  messagingSenderId: "246581954990",
  appId: "1:246581954990:web:0d29f7711b2bb0ef16e03f"
});

const messaging = firebase.messaging();

// Origin dinamis — otomatis mengikuti domain tempat app di-deploy
const APP_ORIGIN = self.location.origin;

// ─── Lifecycle: aktif langsung tanpa tunggu tab lama ditutup ─────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(clients.claim());
});

// ─── Background message: app di background / tab tidak aktif ────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const title = payload.notification?.title ?? 'Notifikasi Baru';
  const body  = payload.notification?.body  ?? '';
  const data  = payload.data ?? {};

  // tag mencegah notifikasi sejenis menumpuk di tray browser
  const tag = data.orderId
    ? `order-${data.orderId}`
    : `notif-${data.userId ?? 'general'}`;

  return self.registration.showNotification(title, {
    body,
    icon:     APP_ORIGIN + '/logo.png',
    badge:    APP_ORIGIN + '/icon-bedge.png',
    tag,
    renotify: true,
    data: {
      url:     data.url ?? APP_ORIGIN + '/',
      orderId: data.orderId,
    },
  });
});

// ─── Push fallback: handle manual jika Firebase SDK tidak menangkap ──────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'Notifikasi Baru', body: event.data.text() } };
  }

  const title = payload.notification?.title ?? 'Notifikasi Baru';
  const body  = payload.notification?.body  ?? '';
  const data  = payload.data ?? {};
  const tag   = data.orderId ? `order-${data.orderId}` : 'notif-general';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     APP_ORIGIN + '/logo.png',
      badge:    APP_ORIGIN + '/icon-bedge.png',
      tag,
      renotify: true,
      data: { url: data.url ?? '/', orderId: data.orderId },
    })
  );
});

// ─── Klik notifikasi: buka/fokus tab yang relevan ────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});