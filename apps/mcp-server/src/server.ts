import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {askPayloadSchema} from '@caliper/core';
import {z} from 'zod';
import {ReviewRunner} from './review-runner';
import {CALIPER_VERSION} from './config';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const ASK_DESCRIPTION =
  'Ask the developer to review UI regions you are unsure how to build while implementing a design. ' +
  'MUST: before calling, stamp data-caliper-ref="<ref>" on each element in the code you just wrote — ' +
  'the review page resolves each zone by that attribute. Opens a browser where the developer answers; ' +
  'returns their answers keyed by ref as a TOON table. If the result text contains "status: PENDING", ' +
  'not every zone was answered in time — call caliper_wait with the returned ticket to keep waiting.';

const WAIT_DESCRIPTION =
  'Resume waiting for developer answers to a pending caliper_ask review. Call with the ticket ' +
  '(the review session id) returned by a PENDING caliper_ask result.';

const waitInputSchema = z.object({
  ticket: z.string().min(1).describe('The session id returned as "ticket" by a PENDING caliper_ask result.'),
});

const runner = new ReviewRunner();
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

await server.connect(new StdioServerTransport());
