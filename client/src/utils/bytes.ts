const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];

export const formatBytes = (x: number) => {
  let l = 0,
    n = Math.trunc(x) || 0;

  while (n >= 1000 && ++l) {
    n = n / 1000;
  }

  return n.toFixed(n < 10 && l > 0 ? 1 : 0) + ' ' + units[l];
};
