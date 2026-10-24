import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, Button, Group, Stack, Text, Paper } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme, cssVariablesResolver } from '../../src/theme';
import { apiClient } from '../../src/shared/api/api-client';
import { AuthorMemoryPanel } from '../../src/features/ai-copilot/AuthorMemoryPanel';
import { EntityExtractionReview } from '../../src/features/ai-copilot/EntityExtractionReview';
import { AuthorRelationshipLocks } from '../../src/features/ai-copilot/AuthorRelationshipLocks';

import '@mantine/core/styles.css';
import '../../src/theme/storycraft.css';
import '../../src/theme/color-mode.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0
    }
  }
});

function TestHarness() {
  const [scenario, setScenario] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('scenario') || 'memory-panel';
  });
  const [novelId, setNovelId] = useState('novel-test-uuid-1');
  const [chapterId, setChapterId] = useState('chapter-test-uuid-1');

  (window as any).__setScenario = setScenario;
  (window as any).__setNovelId = setNovelId;
  (window as any).__queryClient = queryClient;

  return (
    <div style={{ padding: 16 }}>
      <Group mb="md" justify="space-between">
        <Text size="sm" fw={700}>
          P1 HITL Test Harness: <span id="current-scenario">{scenario}</span> (Novel: <span id="current-novel">{novelId}</span>)
        </Text>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => setNovelId('novel-test-uuid-1')}>
            Novel 1
          </Button>
          <Button size="xs" variant="default" onClick={() => setNovelId('novel-test-uuid-2')}>
            Novel 2
          </Button>
        </Group>
      </Group>

      {scenario === 'memory-panel' && (
        <AuthorMemoryPanel
          novelId={novelId}
          chapterId={chapterId}
          content="Nội dung chương thử nghiệm"
          opened={true}
          onClose={() => {}}
          saved={true}
        />
      )}

      {scenario === 'entity-review' && (
        <Paper p="md" withBorder>
          <EntityExtractionReview
            novelId={novelId}
            disabled={false}
            perform={async (fn) => fn()}
            onContinued={async () => {
              await queryClient.invalidateQueries({ queryKey: ['entity-reviews'] });
            }}
          />
        </Paper>
      )}

      {scenario === 'relationship-locks' && (
        <Paper p="md" withBorder>
          <AuthorRelationshipLocks
            novelId={novelId}
            brainVersion={3}
            entities={[
              { entity_id: 'ent-minh-a', name: 'Minh', entity_type: 'character', status: 'Alive', location: 'Đông Hải' },
              { entity_id: 'ent-minh-b', name: 'Minh', entity_type: 'character', status: 'Alive', location: 'Tây Sơn' },
              { entity_id: 'ent-thai', name: 'Thái', entity_type: 'character', status: 'Alive', location: 'Bắc Thành' }
            ]}
            relations={[
              {
                subject: 'Minh',
                relation: 'ally',
                object: 'Thái',
                source: 'author',
                locked: true,
                metadata: {} // Legacy lock lacking exact UUIDs
              },
              {
                subject: 'Minh',
                relation: 'enemy',
                object: 'Thái',
                source: 'author',
                locked: true,
                metadata: {
                  subject_entity_id: 'ent-minh-b',
                  object_entity_id: 'ent-thai'
                }
              }
            ]}
            disabled={false}
            perform={async (fn) => fn()}
            onLocked={async () => {}}
          />
        </Paper>
      )}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
        <TestHarness />
      </MantineProvider>
    </QueryClientProvider>
  );
}
