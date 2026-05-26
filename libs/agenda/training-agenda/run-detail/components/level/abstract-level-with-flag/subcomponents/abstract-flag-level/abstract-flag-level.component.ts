import {
    Component,
    DestroyRef,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { FloatingAnswerFormComponent } from '../answer-floating-form/floating-answer-form.component';
import { SentinelMarkdownViewComponent } from '@sentinel/components/markdown-view';
import { HintContentComponent } from '../hint-content/hint-content.component';
import { AbstractTrainingRunService } from '../../../../../services/training-run/abstract-training-run.service';
import { Hint } from '@crczp/training-model';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

@Component({
    selector: 'crczp-abstract-flag-level',
    templateUrl: './abstract-flag-level.component.html',
    styleUrl: './abstract-flag-level.component.scss',
    imports: [
        AsyncPipe,
        MatButton,
        MatIconButton,
        MatIcon,
        MatTooltip,
        FloatingAnswerFormComponent,
        SentinelMarkdownViewComponent,
        HintContentComponent,
    ],
})
export class AbstractFlagLevelComponent {
    readonly isLoading = input(false);
    readonly hints = input<Hint[]>([]);
    readonly levelContent = input.required<string>();
    readonly solutionContent = input<string | null>(null);

    protected readonly answerSubmitted = output<string>();

    protected readonly activeHints = signal<Hint[]>([]);
    protected readonly isFormCollapsed = signal<boolean>(false);

    protected readonly runService = inject(AbstractTrainingRunService);
    protected readonly destroyRef = inject(DestroyRef);

    protected readonly window = window;

    constructor() {
        toObservable(this.hints)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((hints) => {
                this.activeHints.set(hints.filter((hint) => hint.isRevealed()));
            });
    }
}
