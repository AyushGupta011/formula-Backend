
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

export async function mapLimit(items, max, mapper) {
  const limit = createLimiter(max);
  return Promise.all(items.map((item, i) => limit(() => mapper(item, i))));
}

export default { createLimiter, mapLimit };
