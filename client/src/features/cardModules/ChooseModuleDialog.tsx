import { useId } from 'react';
import { Button, Dialog } from '@/shared/ui';
import { CARD_MODULES, type CardModuleId } from './cardModules';
import styles from './cardModules.module.scss';

type Props = {
  /** Modules the application already has: shown, but not offered again. */
  added: (id: CardModuleId) => boolean;
  onChoose: (id: CardModuleId) => void;
  onClose: () => void;
};

/** «Додати модуль»: every module of the card as a tile; the ones already added are disabled. */
export function ChooseModuleDialog({ added, onChoose, onClose }: Props) {
  const idPrefix = useId();
  return (
    <Dialog open title="Додати модуль" size="lg" onClose={onClose}>
      <ul className={styles.modules} aria-label="Модулі">
        {CARD_MODULES.map((module) => {
          const isAdded = added(module.id);
          const noteId = `${idPrefix}-${module.id}`;
          return (
            <li key={module.id}>
              <Button
                className={styles.module}
                disabled={isAdded}
                aria-describedby={isAdded ? noteId : undefined}
                onClick={() => onChoose(module.id)}
              >
                {module.menuLabel}
                {isAdded && (
                  // Hidden from the name: the button is named by the module, the note describes it.
                  <span id={noteId} className={styles.added} aria-hidden="true">
                    уже додано
                  </span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
