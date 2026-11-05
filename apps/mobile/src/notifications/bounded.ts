// A native token lookup may wait indefinitely for connectivity. No business
// mutation is allowed inside this lookup; a late token is simply discarded.
export async function boundedTokenLookup<T>(
  lookup: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(lookup),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("通知连接超时，请重试")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
