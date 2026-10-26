export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size, fontSize: size * 0.58 }} aria-hidden="true">
      z
    </span>
  );
}
