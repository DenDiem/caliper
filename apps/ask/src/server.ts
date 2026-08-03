import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {askPayloadSchema} from '@caliper/core';
import {z} from 'zod';
import {ReviewRunner} from './review-runner';
import {DesignRunner} from './design-runner';
import {pruneStaleSessions} from './session/persistence';
import {CALIPER_VERSION, SESSION_MAX_AGE_MS} from './config';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const ASK_DESCRIPTION =
  '**You** have specific questions about UI regions you are unsure how to build; you pin them and ' +
  'the developer answers. (To instead let the developer freely mark up whatever they want, with no ' +
  'questions from you, use `caliper_design`.) ' +
  'Anchor each zone with an ordinary CSS selector for an element already on the page — do not edit ' +
  'the app source to add anchors. Include the route (the path that element is on) for every zone. ' +
  "No reliable selector yet (region not built, or you're unsure)? Ask anyway — the developer can " +
  'click the region to point at it. Opens a browser where the developer answers; returns their ' +
  'answers keyed by ref as a TOON table. If the result text contains "status: PENDING", not every ' +
  'zone was answered in time — call caliper_wait with the returned ticket to keep waiting.';

const WAIT_DESCRIPTION =
  'Resume waiting for developer answers to a pending caliper_ask review. Call with the ticket ' +
  '(the review session id) returned by a PENDING caliper_ask result.';

const DESIGN_DESCRIPTION =
  'The developer **freely** marks up the UI and points at what to build/fix — you pose no specific ' +
  'questions. (When you have specific pinned questions, use `caliper_ask`.) ' +
  'Open the running dev preview in a design-review window where the developer picks an element, ' +
  'strikes one for removal, or lassoes an area when no single element fits, and writes what to ' +
  'change. When they submit, the window closes and this returns their marks as a TOON work list ' +
  'keyed by selector, component and styles. If the result contains "status: PENDING", they have ' +
  'not submitted yet — call caliper_design again to keep waiting.';

const waitInputSchema = z.object({
  ticket: z.string().min(1).describe('The session id returned as "ticket" by a PENDING caliper_ask result.'),
});

const designInputSchema = z.object({
  target: z
    .string()
    .optional()
    .describe('Loopback dev-server URL to open (default: the CALIPER_TARGET pinned by `caliper init`).'),
});

pruneStaleSessions(SESSION_MAX_AGE_MS);

const runner = new ReviewRunner();
const designRunner = new DesignRunner();
const server = new McpServer({name: 'caliper', version: CALIPER_VERSION}, {capabilities: {tools: {}}});

server.registerTool(
  'caliper_ask',
  {description: ASK_DESCRIPTION, inputSchema: askPayloadSchema},
  async (payload) => {
    try {
      const result = await runner.ask(payload);
      return {content: [{type: 'text', text: result.text}]};
    } catch (error) {
      return {content: [{type: 'text', text: errorMessage(error)}], isError: true};
    }
  },
);

server.registerTool(
  'caliper_wait',
  {description: WAIT_DESCRIPTION, inputSchema: waitInputSchema},
  async ({ticket}) => {
    try {
      const result = await runner.wait(ticket);
      return {content: [{type: 'text', text: result.text}]};
    } catch (error) {
      return {content: [{type: 'text', text: errorMessage(error)}], isError: true};
    }
  },
);

server.registerTool(
  'caliper_design',
  {description: DESIGN_DESCRIPTION, inputSchema: designInputSchema},
  async (payload) => {
    try {
      const result = await designRunner.design(payload);
      return {content: [{type: 'text', text: result.text}]};
    } catch (error) {
      return {content: [{type: 'text', text: errorMessage(error)}], isError: true};
    }
  },
);

await server.connect(new StdioServerTransport());
