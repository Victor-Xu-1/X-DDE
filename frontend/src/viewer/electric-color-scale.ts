const steps = 32;

/** Sample the native 3Dmol RWB transfer function uniformly in color space.
 * Squaring the stop positions preserves the steeper response near either endpoint. */
export const electricColorStops = Array.from(
  { length: 2 * steps + 1 },
  (_, i) => {
    const amount = (i < steps ? i : 2 * steps - i) / steps;
    const channel = Math.floor(255 * amount);
    const half = (amount * amount) / 2;
    return {
      offset: i <= steps ? half : 1 - half,
      color:
        i <= steps
          ? `rgb(255, ${channel}, ${channel})`
          : `rgb(${channel}, ${channel}, 255)`,
    };
  },
);

export const electricColorBackground = `linear-gradient(90deg, ${electricColorStops
  .map(({ offset, color }) => `${color} ${offset * 100}%`)
  .join(", ")})`;
