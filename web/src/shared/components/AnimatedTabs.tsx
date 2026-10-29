import type { ComponentProps, PropsWithChildren } from 'react';
import { Tabs } from '@animate-ui/react/primitives/radix-ui/tabs';
import './animated-feedback.css';

function Root(props: ComponentProps<typeof Tabs.Root>) {
  return <Tabs.Root {...props} className={`sc-animated-tabs ${props.className ?? ''}`} />;
}
function List(props: ComponentProps<typeof Tabs.List>) {
  return <Tabs.List {...props} className={`sc-animated-tabs-list ${props.className ?? ''}`} />;
}
function Tab(props: ComponentProps<typeof Tabs.Trigger>) {
  return <Tabs.Trigger {...props} className={`sc-animated-tab ${props.className ?? ''}`} />;
}
function Panel({ pt, ...props }: PropsWithChildren<ComponentProps<typeof Tabs.Content> & { pt?: 'md' }>) {
  return <Tabs.Content {...props} forceMount className={`sc-animated-tab-panel ${props.className ?? ''}`} style={{ paddingTop: pt === 'md' ? 16 : undefined, ...props.style }} />;
}
export const AnimatedTabs = Object.assign(Root, { List, Tab, Panel });
