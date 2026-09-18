const subscribers = new Map<string, Set<(data: string) => void>>();

export function publishNotification(userId: string) {
  for (const send of subscribers.get(userId) ?? []) send('refresh');
}

export function notificationStream(userId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let send: (data: string) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  return new ReadableStream({
    start(controller) {
      send = (data) => controller.enqueue(encoder.encode(`event: notification\ndata: ${data}\n\n`));
      const userSubscribers = subscribers.get(userId) ?? new Set();
      userSubscribers.add(send);
      subscribers.set(userId, userSubscribers);
      controller.enqueue(encoder.encode(': connected\n\n'));
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(': keepalive\n\n')), 25_000);
    },
    cancel() {
      clearInterval(heartbeat);
      const userSubscribers = subscribers.get(userId);
      userSubscribers?.delete(send);
      if (userSubscribers?.size === 0) subscribers.delete(userId);
    },
  });
}
