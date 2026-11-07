import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { useState } from 'react';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { SetupFoundationPanel } from '../../src/features/ai-copilot/SetupFoundationPanel';
function account(id: string) {
  useAuthStore.getState().setSession({accessToken:'token-'+id,user:{userId:id,email:id+'@example.test',username:id,role:'AUTHOR',status:'ACTIVE'}});
}
account('author-A');
function Fixture() {
  const [novel,setNovel]=useState('10000000-0000-0000-0000-000000000001');
  return <><button onClick={()=>account('author-A')}>Account A</button><button onClick={()=>account('author-B')}>Account B</button>
    <button onClick={()=>setNovel('10000000-0000-0000-0000-000000000001')}>Novel A</button>
    <button onClick={()=>setNovel('10000000-0000-0000-0000-000000000002')}>Novel B</button>
    <SetupFoundationPanel novelId={novel}/></>;
}
createRoot(document.getElementById('root')!).render(<MantineProvider><Fixture/></MantineProvider>);
