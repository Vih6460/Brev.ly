import { CircleNotchIcon } from '@phosphor-icons/react';

export function Spinner({ size = 18 }: { size?: number }) {
  return <CircleNotchIcon className="spinner" size={size} aria-hidden="true" />;
}
