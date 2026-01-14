export function debounce<T extends (...args: any[]) => void>(callback: T, wait = 300) {
  let timeout: ReturnType<typeof setTimeout>;

  const debounced = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    clearTimeout(timeout);

    return new Promise((resolve) => {
      timeout = setTimeout(() => {
        const result = callback(...args) as ReturnType<T>;
        resolve(result);
      }, wait);
    });
  };

  return debounced;
}
