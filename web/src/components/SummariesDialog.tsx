import { useEffect, useState } from 'react';
import { Calculator, Play } from 'lucide-react';
import { formatCost, formatTokens, type CodexInclusion, type JobInfo, type ModelRef } from '@novelmaker/shared';
import { api } from '../lib/api';
import { t, tn } from '../lib/i18n';
import { keys, queryClient, useNovel } from '../lib/queries';
import { toast } from '../lib/store';
import { ModelPicker, useLastSelection } from './ai';
import { Badge, Button, Checkbox, Field, Modal, Select } from './ui';

interface Estimate {
  tasks: { scenes: number; chapters: number; novel: number };
  promptTokens: number;
  completionTokens: number;
  cost: number | null;
  pricingKnown: boolean;
}

export function SummariesDialog({ novelId, onClose, preset = 'all' }: { novelId: string; onClose: () => void; preset?: 'scenes' | 'all' }) {
  const { data: novel } = useNovel(novelId);
  const last = useLastSelection('summary', ['summary'], 'summary-scene');
  const [model, setModel] = useState<ModelRef | null>(last.model);
  const [scenes, setScenes] = useState(true);
  const [chapters, setChapters] = useState(preset === 'all');
  const [whole, setWhole] = useState(preset === 'all');
  const [regenerate, setRegenerate] = useState(false);
  const [volumeEntry, setVolumeEntry] = useState(true);
  const [inclusion, setInclusion] = useState<CodexInclusion>('auto');
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setModel((m) => m ?? last.model), [last.model]);

  const opts = () => ({
    novelId,
    model,
    steps: { scenes, chapters, novel: whole },
    regenerate,
    volumeEntry: whole && volumeEntry && novel?.seriesId ? { inclusion } : null,
  });
  const estimate = async () => {
    if (!model) return toast.error(t('Please choose a model.'));
    setBusy(true);
    try {
      setEst(await api.post<Estimate>('/api/jobs/summaries/estimate', opts()));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => setEst(null), [scenes, chapters, whole, regenerate, model?.modelId]);
  const start = async () => {
    if (!model) return toast.error(t('Please choose a model.'));
    try {
      await api.post<JobInfo>('/api/jobs/summaries', opts());
      queryClient.invalidateQueries({ queryKey: keys.jobs });
      toast.success(t('Job started — it keeps running in the background (progress at the top right).'));
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  const total = est ? est.tasks.scenes + est.tasks.chapters + est.tasks.novel : 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Generate summaries')}
      width="max-w-xl"
      footer={
        <>
          <Button icon={<Calculator className="size-4" />} loading={busy} onClick={estimate}>
            {t('Estimate cost')}
          </Button>
          <Button variant="primary" icon={<Play className="size-4" />} disabled={!est || total === 0} onClick={start} title={!est ? t('Estimate cost first') : undefined}>
            {t('Start')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-stone-600 dark:text-stone-400">
          {t(
            'A whole novel is too large and too expensive for many models. So it’s summarized in stages: missing scene summaries → chapter summaries → summary of the novel. The prompts for this are regular prompts (type “Summary”) and can be customized in the prompt workshop.',
          )}
        </p>
        <Field label={t('Model')}>
          <ModelPicker value={model} onChange={setModel} />
        </Field>
        <div className="space-y-2">
          <Checkbox checked={scenes} onChange={setScenes} label={t('1. Summarize scenes')} />
          <Checkbox checked={chapters} onChange={setChapters} label={t('2. Chapters from scene summaries')} />
          <Checkbox checked={whole} onChange={setWhole} label={t('3. Novel from chapter summaries')} />
          <Checkbox
            checked={regenerate}
            onChange={setRegenerate}
            label={t('Regenerate existing summaries')}
            hint={t('Otherwise only missing ones are added.')}
          />
        </div>
        {whole && novel?.seriesId && (
          <div className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
            <Checkbox
              checked={volumeEntry}
              onChange={setVolumeEntry}
              label={t('Create/update codex entry “Volume {volume}: {title}”', { volume: novel.volumeNumber ?? '?', title: novel.title })}
              hint={t('Type “Volume”, at series level — so later volumes know the story.')}
            />
            {volumeEntry && (
              <Field label={t('Inclusion')} className="mt-2">
                <Select value={inclusion} onChange={(e) => setInclusion(e.target.value as CodexInclusion)}>
                  <option value="auto">{t('when mentioned (title as alias)')}</option>
                  <option value="always">{t('always')}</option>
                  <option value="never">{t('only via codex.get(…)')}</option>
                </Select>
              </Field>
            )}
          </div>
        )}
        {est && (
          <div className="rounded-md bg-stone-100 p-3 dark:bg-stone-800">
            <div className="flex flex-wrap gap-2">
              <Badge>{tn(est.tasks.scenes, '{n} scene', '{n} scenes')}</Badge>
              <Badge>{tn(est.tasks.chapters, '{n} chapter', '{n} chapters')}</Badge>
              <Badge>{est.tasks.novel ? t('Volume') : t('no volume')}</Badge>
            </div>
            <div className="mt-2">
              {t('≈ {input} tokens in, ≈ {output} out', { input: formatTokens(est.promptTokens), output: formatTokens(est.completionTokens) })} ·{' '}
              <b>{est.pricingKnown ? `≈ ${formatCost(est.cost)}` : t('Price unknown (local model, or model list not loaded)')}</b>
            </div>
            {total === 0 && <div className="mt-1 text-stone-500">{t('Nothing to do — everything is already summarized.')}</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
