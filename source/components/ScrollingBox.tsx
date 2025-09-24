import React from 'react';
import {Box} from 'ink';

function ScrollingBox({
	children,
	borderColor = 'cyan',
}: {
	children: React.ReactNode;
	borderColor?: string;
	borderStyle?: any;
}) {
	return (
		<Box
			borderColor={borderColor}
			borderStyle="round"
			flexDirection="column"
			flexGrow={1}
			justifyContent="flex-end"
			overflow="hidden"
			paddingX={1}
			width="100%"
		>
			<Box flexShrink={0} flexDirection="column">
				{children}
			</Box>
		</Box>
	);
}

export default ScrollingBox;
