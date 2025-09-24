import React from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import Worker, {type WorkerStats} from './components/Worker.js';
import OpenAI from 'openai';

type Props = {
	model: string;
	concurrent: number;
	output: string | undefined;
	prompt: string;
	runDuration: number | undefined;
};

export default function App({
	model,
	concurrent: initialConcurrent,
	output,
	prompt,
	runDuration,
}: Props) {
	const {exit} = useApp();

	const [targetConcurrent, setTargetConcurrent] =
		React.useState(initialConcurrent);
	const [workers, setWorkers] = React.useState<
		{id: number; status: 'running' | 'stopping'}[]
	>(() =>
		Array.from({length: initialConcurrent}, (_, i) => ({
			id: i,
			status: 'running',
		})),
	);
	const nextWorkerId = React.useRef(initialConcurrent);

	useInput((input, key) => {
		if (input === 'q') {
			exit();
		}

		if (key.upArrow) {
			setTargetConcurrent(c => c + 1);
		}

		if (key.downArrow) {
			setTargetConcurrent(c => Math.max(0, c - 1));
		}
	});

	React.useEffect(() => {
		setWorkers(currentWorkers => {
			const runningWorkers = currentWorkers.filter(w => w.status === 'running');
			const stoppingWorkers = currentWorkers.filter(
				w => w.status === 'stopping',
			);
			const currentRunningCount = runningWorkers.length;
			const desiredCount = targetConcurrent;

			if (desiredCount > currentRunningCount) {
				let needed = desiredCount - currentRunningCount;
				const workersToRestart = stoppingWorkers.slice(0, needed);
				const idsToRestart = workersToRestart.map(w => w.id);
				needed -= workersToRestart.length;

				const updatedWorkers = currentWorkers.map(w =>
					idsToRestart.includes(w.id) ? {...w, status: 'running' as const} : w,
				);

				const newWorkers = Array.from({length: needed}, () => ({
					id: nextWorkerId.current++,
					status: 'running' as const,
				}));

				return [...updatedWorkers, ...newWorkers];
			} else if (desiredCount < currentRunningCount) {
				const diff = currentRunningCount - desiredCount;
				const idsToStop = runningWorkers.slice(-diff).map(w => w.id);
				return currentWorkers.map(w =>
					idsToStop.includes(w.id) ? {...w, status: 'stopping'} : w,
				);
			}
			return currentWorkers;
		});
	}, [targetConcurrent]);

	const [workerStats, setWorkerStats] = React.useState<
		Record<number, WorkerStats>
	>({});
	const [startTime] = React.useState(Date.now());
	const [totalCompleted, setTotalCompleted] = React.useState(0);
	const [totalPromptTokens, setTotalPromptTokens] = React.useState(0);
	const [totalCompletionTokens, setTotalCompletionTokens] = React.useState(0);
	const [doneCount, setDoneCount] = React.useState(0);

	const baseURL = process.env['OPENAI_API_BASE'] || 'http://localhost:8000/v1';
	const client = new OpenAI({
		apiKey: process.env['OPENAI_API_KEY'],
		baseURL,
	});

	// Exit if all workers have completed their tasks.
	// This is used when runDuration is set, or for single-run scenarios.
	React.useEffect(() => {
		if (doneCount > 0 && doneCount === workers.length) {
			exit();
		}
	}, [doneCount, workers.length, exit]);

	// Exit if the user has set the concurrent workers to 0 and all workers have stopped.
	React.useEffect(() => {
		if (targetConcurrent === 0 && workers.length === 0) {
			exit();
		}
	}, [targetConcurrent, workers.length, exit]);

	const handleDurationEnd = React.useCallback(() => {
		setDoneCount(prev => prev + 1);
	}, []);

	const handleWorkerStopped = React.useCallback((workerId: number) => {
		setWorkers(prev => prev.filter(w => w.id !== workerId));
	}, []);

	const statsValues = Object.values(workerStats);
	const aggregatedSpeed = statsValues.reduce((acc, stats) => {
		return acc + (stats?.speed ?? 0);
	}, 0);

	// const activeWorkers = statsValues.filter(s => s?.speed !== null).length;
	// const averageSpeed = activeWorkers > 0 ? aggregatedSpeed / activeWorkers : 0;

	const completedStats = statsValues.filter(s => s?.isDone);
	const avgPrefillTps =
		completedStats.length > 0
			? completedStats.reduce(
					(acc, stats) => acc + (stats?.prefillTps ?? 0),
					0,
			  ) / completedStats.length
			: 0;
	const avgDecodeTps =
		completedStats.length > 0
			? completedStats.reduce(
					(acc, stats) => acc + (stats?.decodeTps ?? 0),
					0,
			  ) / completedStats.length
			: 0;

	const statsWithTtft = statsValues.filter(s => s?.ttft != null);
	const avgTtft =
		statsWithTtft.length > 0
			? statsWithTtft.reduce((acc, stats) => acc + (stats.ttft ?? 0), 0) /
			  statsWithTtft.length
			: 0;

	const statsWithTtfr = statsValues.filter(s => s?.ttfr != null);
	const avgTtfr =
		statsWithTtfr.length > 0
			? statsWithTtfr.reduce((acc, stats) => acc + (stats.ttfr ?? 0), 0) /
			  statsWithTtfr.length
			: 0;

	const elapsedSeconds = (Date.now() - startTime) / 1000;
	const elapsedMinutes = elapsedSeconds / 60;
	const requestsPerMinute =
		elapsedMinutes > 0 ? totalCompleted / elapsedMinutes : 0;

	const overallPromptTps =
		elapsedSeconds > 0 ? totalPromptTokens / elapsedSeconds : 0;
	const overallCompletionTps =
		elapsedSeconds > 0 ? totalCompletionTokens / elapsedSeconds : 0;

	const progress = runDuration ? (elapsedSeconds / runDuration) * 100 : 0;

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box
				flexDirection="row"
				justifyContent="space-between"
				paddingX={1}
				flexWrap="wrap"
			>
				<Text>LoadLLM: {process.env['npm_package_version']}</Text>
				<Text>
					Workers: {workers.length} (target: {targetConcurrent})
				</Text>
				<Text>Target: {baseURL}</Text>
				<Text>Model: {model}</Text>
				{runDuration && (
					<Text>
						Duration: {elapsedSeconds.toFixed(0)}s / {runDuration}s (
						{progress.toFixed(2)}%)
					</Text>
				)}
			</Box>
			<Box
				flexDirection="row"
				justifyContent="space-between"
				paddingX={1}
				flexWrap="wrap"
			>
				<Text>RPM: {requestsPerMinute.toFixed(2)}</Text>
				<Text>Avg Prefill TPS: {avgPrefillTps.toFixed(2)}</Text>
				<Text>Avg Decode TPS: {avgDecodeTps.toFixed(2)}</Text>
				<Text>Avg TTFT: {avgTtft.toFixed(0)}ms</Text>
				<Text>Avg TTFR: {avgTtfr.toFixed(0)}ms</Text>
			</Box>
			<Box
				flexDirection="row"
				justifyContent="space-between"
				paddingX={1}
				flexWrap="wrap"
			>
				<Text>Agg Speed: {aggregatedSpeed.toFixed(0)} B/s</Text>
				<Text>Overall Prompt TPS: {overallPromptTps.toFixed(2)}</Text>
				<Text>Overall Completion TPS: {overallCompletionTps.toFixed(2)}</Text>
			</Box>
			<Box paddingX={1}>
				<Text color="gray">↑/↓ arrows to change worker count.</Text>
			</Box>
			{workers.map(worker => (
				<Worker
					key={worker.id}
					workerId={worker.id}
					status={worker.status}
					output={output}
					client={client}
					model={model}
					prompt={prompt}
					runDuration={runDuration}
					startTime={startTime}
					onDone={handleDurationEnd}
					onStopped={handleWorkerStopped}
					onStatsUpdate={stats => {
						setWorkerStats(prev => ({
							...prev,
							[worker.id]: {
								...(prev[worker.id] || {}),
								...stats,
							},
						}));

						if (stats.promptTokens && stats.completionTokens) {
							setTotalPromptTokens(prev => prev + (stats.promptTokens ?? 0));
							setTotalCompletionTokens(
								prev => prev + (stats.completionTokens ?? 0),
							);
						}

						if (stats.isDone) {
							setTotalCompleted(prev => prev + 1);
						}
					}}
				/>
			))}
		</Box>
	);
}
