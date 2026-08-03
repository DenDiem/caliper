interface Props {
  armed: boolean;
}

// The base-mode legend. Passive tells you to hold Alt to mark; armed tells you clicks mark and Alt
// reaches the app. Review re-anchoring passes armed too, since a click there always picks.
export const Badge = ({armed}: Props) => (
  <div class="caliper-badge">
    <span class="caliper-badge__dot" />
    {armed
      ? 'Click to mark · scribble to remove · circle an area · Alt-click the app · Esc'
      : 'Hold Alt to mark · Alt-scribble removes · Alt-circle an area · Esc'}
  </div>
);
