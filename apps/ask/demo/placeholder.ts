import {cameraIcon} from './icons';

const HUE_STEP = 47;

export const photoPlaceholder = (seedIndex: number, extraClass = ''): string => {
  const hue = (seedIndex * HUE_STEP) % 360;
  return `<div class="photo-placeholder ${extraClass}" style="--hue:${hue}">${cameraIcon()}</div>`;
};
