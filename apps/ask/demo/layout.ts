import {DEMO_STYLES} from './styles';

export interface DocumentOptions {
  title: string;
  body: string;
  script?: string;
}

export const renderDocument = ({title, body, script}: DocumentOptions): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${DEMO_STYLES}</style>
</head>
<body>
${body}
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
