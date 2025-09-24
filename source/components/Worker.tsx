import React from 'react';
import {Box, Text} from 'ink';
import {Task} from 'ink-task-list';
import {streamChatCompletion} from '../core.js';
import spinners from 'cli-spinners';
import ScrollingBox from './ScrollingBox.js';

export type WorkerStats = {
	speed?: number | null;
	promptTokens?: number;
	completionTokens?: number;
	prefillTps?: number;
	decodeTps?: number;
	isDone?: boolean;
	ttft?: number | null;
	ttfr?: number | null;
};

function Worker({
	workerId,
	status,
	output,
	client,
	model,
	prompt,
	runDuration,
	startTime,
	onStatsUpdate,
	onDone,
	onStopped,
}: {
	workerId: number;
	status: 'running' | 'stopping';
	output: string | undefined;
	client: any;
	model: string;
	prompt: string;
	runDuration: number | undefined;
	startTime: number;
	onStatsUpdate: (stats: WorkerStats) => void;
	onDone: () => void;
	onStopped: (workerId: number) => void;
}) {
	const [response, setResponse] = React.useState('');
	const [reasoning, setReasoning] = React.useState('');
	const [error, setError] = React.useState('');
	const [ttft, setTtft] = React.useState<number | null>(null);
	const [ttfr, setTtfr] = React.useState<number | null>(null);
	const [stats, setStats] = React.useState<WorkerStats>({speed: null});
	const [iteration, setIteration] = React.useState(0);
	const [consecutiveErrors, setConsecutiveErrors] = React.useState(0);
	const [jobs, setJobs] = React.useState<{id: number; state: string}[]>([]);
	const MAX_JOBS = 4;

	const statusRef = React.useRef(status);
	React.useEffect(() => {
		statusRef.current = status;
	}, [status]);

	const BASE_DELAY_MS = 1000; // 1 second
	const MAX_DELAY_MS = 30000; // 30 seconds

	React.useEffect(() => {
		const workerStartTime = performance.now();
		const jobId = iteration;
		setJobs(prev => [...prev, {id: jobId, state: 'pending'}].slice(-MAX_JOBS));
		const updateJobState = (newState: string) => {
			setJobs(prev =>
				prev.map(j => (j.id === jobId ? {...j, state: newState} : j)),
			);
		};

		setResponse('');
		setReasoning('');
		setError('');
		setTtft(null);
		setTtfr(null);

		let totalBytes = 0;
		let lastBytes = 0;
		const numSamples = 10;
		const numbers = [] as number[];
		for (let i = 0; i < numSamples; i++) numbers.push(0);

		const intervalId = setInterval(() => {
			const delta = totalBytes - lastBytes;
			if (delta === 0 && stats.speed === null) return;
			numbers.shift();
			numbers.push(delta);
			const sum =
				(numbers.reduce((a, b) => a + b, 0) / numbers.length) * numSamples;
			onStatsUpdate({speed: sum});
			setStats(prev => ({...prev, speed: sum}));
			lastBytes = totalBytes;
		}, 1000 / numSamples);

		async function fetchData() {
			let ttftValue: number | null = null;
			let ttfrValue: number | null = null;
			try {
				const stream = streamChatCompletion(client, model, prompt, output);

				for await (const event of stream) {
					updateJobState('loading');
					if (event.type === 'ttft') {
						ttftValue = event.value;
						setTtft(event.value);
					} else if (event.type === 'ttfr') {
						ttfrValue = event.value;
						setTtfr(event.value);
					} else if (event.type === 'content') {
						setResponse(prev => prev + event.value);
						totalBytes += event.byteLength;
					} else if (event.type === 'reasoning') {
						setReasoning(prev => prev + event.value);
						totalBytes += event.byteLength;
					} else if (event.type === 'usage') {
						const duration = performance.now() - workerStartTime;

						let firstOutputTime: number | null = null;
						if (ttftValue !== null && ttfrValue !== null) {
							firstOutputTime = Math.min(ttftValue, ttfrValue);
						} else {
							firstOutputTime = ttftValue ?? ttfrValue;
						}

						let prefillTps: number | undefined;
						if (firstOutputTime !== null && firstOutputTime > 0) {
							prefillTps = (event.value.prompt_tokens / firstOutputTime) * 1000;
						}

						let decodeTps: number | undefined;
						const decodeDuration = duration - (firstOutputTime ?? 0);
						if (firstOutputTime !== null && decodeDuration > 0) {
							decodeTps =
								(event.value.completion_tokens / decodeDuration) * 1000;
						}

						const newStats: WorkerStats = {
							promptTokens: event.value.prompt_tokens,
							completionTokens: event.value.completion_tokens,
							prefillTps,
							decodeTps,
							ttft: ttftValue,
							ttfr: ttfrValue,
						};
						onStatsUpdate(newStats);
						setStats(prev => ({...prev, ...newStats}));
					} else if (event.type === 'done') {
						updateJobState('success');
						onStatsUpdate({isDone: true, speed: null});
						setConsecutiveErrors(0);

						if (statusRef.current === 'stopping') {
							onStopped(workerId);
							return;
						}

						const elapsed = (Date.now() - startTime) / 1000;
						// Stop if no run duration is set (single run) or if the duration has been exceeded.
						if (!runDuration || elapsed > runDuration) {
							onDone();
							return;
						}

						setIteration(i => i + 1);
					}
				}
			} catch (error) {
				if (error instanceof Error) {
					setError(error.message);
				}

				updateJobState('error');
				const nextErrorCount = consecutiveErrors + 1;
				setConsecutiveErrors(nextErrorCount);

				const delay = Math.min(
					MAX_DELAY_MS,
					BASE_DELAY_MS * 2 ** (nextErrorCount - 1),
				);

				setError(prev => `${prev} (retrying in ${Math.round(delay / 1000)}s)`);

				if (statusRef.current === 'stopping') {
					onStopped(workerId);
					return;
				}

				const elapsed = (Date.now() - startTime) / 1000;
				// Stop if no run duration is set (single run) or if the duration has been exceeded.
				if (!runDuration || elapsed > runDuration) {
					onDone();
					return;
				}

				setTimeout(() => {
					setIteration(i => i + 1);
				}, delay);
			}
		}

		fetchData();

		return () => {
			clearInterval(intervalId);
		};
	}, [iteration]);

	return (
		<Box flexDirection="row" height={7}>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				paddingX={1}
				width={30}
			>
				<Text>
					{status === 'running' ? (
						<Text color="green">▶</Text>
					) : (
						<Text color="red">▼</Text>
					)}{' '}
					Worker {workerId + 1}
				</Text>
				{jobs.map(job => {
					let label = 'Unknown';
					if (job.state === 'pending') {
						label = `Prefill`;
					} else if (job.state === 'loading') {
						label = `Decoding`;
					} else if (job.state === 'success') {
						label = `Success`;
					} else if (job.state === 'error') {
						label = `Error`;
					}

					return (
						<Task
							key={job.id}
							label={label}
							state={job.state as any}
							spinner={spinners.dots}
						/>
					);
				})}
			</Box>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				paddingX={1}
				width={30}
			>
				<Text>{`Speed: ${
					stats.speed != null ? stats.speed.toFixed(0) + ' B/s' : '...'
				}`}</Text>
				<Text>{`TTFR: ${ttfr != null ? ttfr.toFixed(0) + ' ms' : '...'}`}</Text>
				<Text>{`TTFT: ${ttft != null ? ttft.toFixed(0) + ' ms' : '...'}`}</Text>
			</Box>
			<ScrollingBox>
				<Text color="blue">{reasoning}</Text>
				<Text>{response}</Text>
				<Text color="red">{error}</Text>
			</ScrollingBox>
		</Box>
	);
}

export default Worker;
