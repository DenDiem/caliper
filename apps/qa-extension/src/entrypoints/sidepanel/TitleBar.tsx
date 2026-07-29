interface Props {
  jiraKey: string | null;
}

export const TitleBar = ({jiraKey}: Props) => (
  <header class="title">
    <div class="title__brand">
      <span class="title__mark" />
      <span class="title__word">CALIPER</span>
    </div>
    {jiraKey ? (
      <span class="title__jira">
        <span class="title__dot" />
        {jiraKey}
      </span>
    ) : null}
  </header>
);
