'use client';

import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { COMPONENTS } from './MDXComponents';

interface MDXRendererProps {
    compiledSource: MDXRemoteSerializeResult;
}

export function MDXRenderer({ compiledSource }: MDXRendererProps) {
    return <MDXRemote {...compiledSource} components={COMPONENTS} />;
}
