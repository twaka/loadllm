import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {type Writable} from 'node:stream';

interface LogEntry {
	timestamp: string;
	requestId: string;
	type: 'start' | 'content' | 'reasoning' | 'usage' | 'done';
	prompt?: string;
	content?: string;
	reasoning?: string;
	usage?: any;
}

type ChatEvent =
	| {type: 'ttft'; value: number}
	| {type: 'ttfr'; value: number}
	| {type: 'content'; value: string; byteLength: number}
	| {type: 'reasoning'; value: string; byteLength: number}
	| {type: 'usage'; value: any}
	| {type: 'done'};

export async function* streamChatCompletion(
	client: any,
	model: string,
	prompt: string,
	output: string | undefined,
): AsyncGenerator<ChatEvent> {
	let logStream: Writable | undefined;
	if (output) {
		if (output === 'stdout') {
			logStream = process.stdout;
		} else {
			logStream = fs.createWriteStream(output, {flags: 'a'});
		}
	}

	const requestId = crypto.randomUUID();
	const timeStart = performance.now();

	if (logStream) {
		const logEntry: LogEntry = {
			timestamp: new Date().toISOString(),
			requestId: requestId,
			type: 'start',
			prompt: prompt,
		};
		logStream.write(JSON.stringify(logEntry) + '\n');
	}

	const stream = await client.chat.completions.create({
		model: model,
		reasoning: {enabled: true},
		messages: [{role: 'user', content: prompt}],
		stream: true,
	});

	let isFirstContent = true;
	let isFirstReasoning = true;

	for await (const event of stream as any) {
		if (event.choices[0]) {
			const content = event.choices[0].delta.content;
			if (content) {
				if (isFirstContent) {
					const timeEnd = performance.now();
					yield {type: 'ttft', value: timeEnd - timeStart};
					isFirstContent = false;
				}
				const byteLength = Buffer.byteLength(content, 'utf8');
				if (logStream) {
					const logEntry: LogEntry = {
						timestamp: new Date().toISOString(),
						requestId: requestId,
						type: 'content',
						content: content,
					};
					logStream.write(JSON.stringify(logEntry) + '\n');
				}
				yield {type: 'content', value: content, byteLength};
			}

			const reasoning = (event.choices[0].delta as any).reasoning;
			if (reasoning) {
				if (isFirstReasoning) {
					const timeEnd = performance.now();
					yield {type: 'ttfr', value: timeEnd - timeStart};
					isFirstReasoning = false;
				}
				const byteLength = Buffer.byteLength(reasoning, 'utf8');
				if (logStream) {
					const logEntry: LogEntry = {
						timestamp: new Date().toISOString(),
						requestId: requestId,
						type: 'reasoning',
						reasoning: reasoning,
					};
					logStream.write(JSON.stringify(logEntry) + '\n');
				}
				yield {type: 'reasoning', value: reasoning, byteLength};
			}
		}

		const usage = event.usage;
		if (usage) {
			if (logStream) {
				const logEntry: LogEntry = {
					timestamp: new Date().toISOString(),
					requestId: requestId,
					type: 'usage',
					usage: usage,
				};
				logStream.write(JSON.stringify(logEntry) + '\n');
			}
			yield {type: 'usage', value: usage};
		}
	}

	if (logStream) {
		const logEntry: LogEntry = {
			timestamp: new Date().toISOString(),
			requestId: requestId,
			type: 'done',
		};
		logStream.write(JSON.stringify(logEntry) + '\n');
		if (logStream !== process.stdout) {
			(logStream as fs.WriteStream).end();
		}
	}

	yield {type: 'done'};
}
