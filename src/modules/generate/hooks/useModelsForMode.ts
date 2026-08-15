import { useEffect, useState } from 'react';
import { ipc } from '@/shared/lib/ipc';
import { useGenerateStore } from '../store';
import type { KieModel } from '@/shared/types/kie';

/**
 * Модели текущего режима, с гарантией что модель выбрана и параметры ей соответствуют.
 *
 * Живёт в хуке, а не в панели параметров, потому что панель смонтирована только в
 * расширенном режиме. Пока выбор модели по умолчанию был там, в простом режиме на чистой
 * установке модель не выбиралась вовсе: кнопка генерации оставалась заблокированной, и
 * ничто не подсказывало почему. Там же предзаполняются обязательные параметры — без них
 * сервис отвергает запрос, и в простом режиме генерация падала бы на пустом месте.
 *
 * Урок блока C: правило, реализованное только в компоненте расширенного режима, не
 * является правилом.
 */
export function useModelsForMode(): { models: KieModel[]; selected: KieModel | undefined } {
  const [models, setModels] = useState<KieModel[]>([]);
  const mode = useGenerateStore((s) => s.mode);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const syncParamsToModel = useGenerateStore((s) => s.syncParamsToModel);

  useEffect(() => {
    let cancelled = false;

    ipc
      .invoke('catalog:for-mode', mode)
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        const chosen = useGenerateStore.getState().selectedModelId;
        if (!list.some((m) => m.id === chosen)) {
          setSelectedModelId(list[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, setSelectedModelId]);

  const selected = models.find((m) => m.id === selectedModelId);

  // Смена модели: выбросить то, чего новая схема не допускает, и предзаполнить
  // обязательное. Значение, выпавшее из схемы, не заменяется допустимым — подстановка
  // отправила бы то, чего пользователь не выбирал.
  useEffect(() => {
    if (selected) syncParamsToModel(selected);
  }, [selected?.id, syncParamsToModel]);

  return { models, selected };
}
