#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ loadllm

	Options
	  --model (-m)  Model to use
		--concurrent (-c)  Number of concurrent requests to make
		--output (-o)  Output file to write results to
		--prompt (-p)  Prompt to send to the model
		--duration (-d)  Duration to run the test for (in seconds)

	Examples
	  $ loadllm -m gpt-oss-20b -c 3 -d 60
`,
	{
		importMeta: import.meta,
		flags: {
			model: {
				type: 'string',
				isRequired: true,
				alias: 'm',
			},
			concurrent: {
				type: 'number',
				default: 1,
				alias: 'c',
			},
			output: {
				type: 'string',
				alias: 'o',
			},
			prompt: {
				type: 'string',
				default: 'Tell me about the history of Tokyo.',
				alias: 'p',
			},
			duration: {
				type: 'number',
				alias: 'd',
			},
		},
	},
);

render(
	<App
		model={cli.flags.model}
		concurrent={cli.flags.concurrent}
		output={cli.flags.output}
		prompt={cli.flags.prompt}
		runDuration={cli.flags.duration}
	/>,
);
