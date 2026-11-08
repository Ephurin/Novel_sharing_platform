import { useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Collapsible } from '@animate-ui/react/primitives/radix-ui/collapsible';
import { AnimatedChoiceGroup } from '../../shared/components/AnimatedChoiceGroup';

export function HomeGenres({ genres, genre, onChange }: { genres: string[]; genre: string; onChange: (genre: string) => void }) {
  const compact = useMediaQuery('(max-width: 540px)');
  const [open, setOpen] = useState(false);
  const value = genre ? `genre:${genre}` : 'all';
  const options = [{ value: 'all', label: 'Tất cả' }, ...genres.map(name => ({ value: `genre:${name}`, label: name }))];
  const group = (items: typeof options) => <AnimatedChoiceGroup className="sc-home-genres" label="Khám phá theo thể loại" controls="home-discovery-results"
    value={value} onChange={next => onChange(next === 'all' ? '' : next.slice(6))} options={items} />;
  if (!compact || options.length <= 4) return group(options);
  const visible = options.filter((option, index) => index < 4 || option.value === value);
  return <Collapsible.Root className="sc-home-genre-disclosure" open={open} onOpenChange={setOpen}>
    <div hidden={open}>{group(visible)}</div>
    <Collapsible.Content forceMount aria-hidden={!open} className="sc-home-genre-content">
      <div inert={!open}>{group(options)}</div>
    </Collapsible.Content>
    <Collapsible.Trigger type="button" className="sc-home-genre-more">{open ? 'Thu gọn thể loại' : 'Xem thêm thể loại'}</Collapsible.Trigger>
  </Collapsible.Root>;
}
