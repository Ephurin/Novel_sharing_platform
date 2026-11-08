import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthorMemoryPanel } from '../../src/features/ai-copilot/AuthorMemoryPanel';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import {StoryPlanEditor} from '../../src/features/ai-copilot/StoryPlanEditor';
import { SetupFoundationPanel } from '../../src/features/ai-copilot/SetupFoundationPanel';
function account(id: string) {
  useAuthStore.getState().setSession({accessToken:'token-'+id,user:{userId:id,email:id+'@example.test',username:id,role:'AUTHOR',status:'ACTIVE'}});
}
account('author-A');
function Fixture() {
  const [novel,setNovel]=useState('10000000-0000-0000-0000-000000000001');
  useEffect(()=>{Object.assign(window,{switchFixtureAccount:account,switchFixtureNovel:setNovel});},[]);
  if (new URLSearchParams(window.location.search).has('full')) return <AuthorMemoryPanel novelId={novel} chapterId="20000000-0000-0000-0000-000000000001" content="" saved={false} opened={true} onClose={()=>{}}/>;
  return <><button onClick={()=>account('author-A')}>Account A</button><button onClick={()=>account('author-B')}>Account B</button>
    <button onClick={()=>setNovel('10000000-0000-0000-0000-000000000001')}>Novel A</button>
    <button onClick={()=>setNovel('10000000-0000-0000-0000-000000000002')}>Novel B</button>
    {new URLSearchParams(window.location.search).has('plan')?<StoryPlanEditor novelId={novel}/>:<SetupFoundationPanel novelId={novel}/>}</>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MantineProvider><Fixture/></MantineProvider></QueryClientProvider>);
