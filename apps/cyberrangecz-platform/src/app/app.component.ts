import { AfterViewInit, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SentinelAuthService } from '@sentinel/auth';
import { AgendaContainer } from '@sentinel/layout';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { NavConfigFactory } from './utils/nav-config-factory';
import { PortalDynamicEnvironment } from './portal-dynamic-environment';

// eslint-disable-next-line @nx/enforce-module-boundaries
import packagejson from '../../../../package.json';
import { LoadingService } from './services/loading.service';
import { ValidPath } from '@crczp/routing-commons';
import { Utils } from '@crczp/utils';
import { CommonModule } from '@angular/common';
import { SentinelLayout1Component } from '@sentinel/layout/layout1';
import { ToolbarComponent } from '@sentinel/layout/common-components';

/**
 * Main component serving as wrapper for layout and router outlet
 */
@Component({
    selector: 'crczp-app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: true,
    imports: [
        CommonModule,
        RouterOutlet,
        SentinelLayout1Component,
        ToolbarComponent,
    ],
})
export class AppComponent implements OnInit, AfterViewInit {
    title$: Observable<string>;
    subtitle$: Observable<string>;
    agendaContainers$: Observable<AgendaContainer[]>;
    notificationRoute: ValidPath = 'notifications';
    version = '';
    hideSidebar = signal<boolean>(false);
    protected readonly loadingService = inject(LoadingService);
    protected readonly authService = inject(SentinelAuthService);
    private readonly router = inject(Router);
    private readonly activatedRoute = inject(ActivatedRoute);

    constructor() {
        this.activatedRoute.queryParams.subscribe((params) => {
            this.hideSidebar.set(params['hideSidebar'] === 'true');
        });
    }

    ngOnInit(): void {
        this.title$ = this.getTitleFromRouter();
        this.subtitle$ = this.getSubtitleFromRouter();
        this.agendaContainers$ = this.authService.activeUser$.pipe(
            filter((user) => user != null),
            map((user) =>
                Utils.NavBar.buildNav(NavConfigFactory.buildNavConfig(user)),
            ),
        );

        this.version =
            PortalDynamicEnvironment.getConfig().version || packagejson.version;
    }

    ngAfterViewInit(): void {
        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe((event: NavigationEnd) => {
                this.updateActiveNavItem(event.urlAfterRedirects);
            });

        // Apply on initial load
        this.updateActiveNavItem(this.router.url);
    }

    /**
     * Marks the nav button matching the current route as fctf-active.
     * @sentinel/layout does not expose an active class, so we inject it manually.
     */
    private updateActiveNavItem(currentUrl: string): void {
        setTimeout(() => {
            const navDrawer = document.querySelector('.nav-drawer');
            if (!navDrawer) return;

            // Remove all existing active marks
            navDrawer.querySelectorAll('.fctf-active').forEach((el) => {
                el.classList.remove('fctf-active');
            });

            const urlLower = currentUrl.toLowerCase().split('?')[0];

            // Map URL segments → nav button label text
            // Order matters: more specific segments first (longer = higher priority)
            const segmentToLabel: Array<{ segment: string; label: string; parentLabel?: string }> = [
                { segment: 'adaptive-definition', label: 'adaptive', parentLabel: 'definition' },
                { segment: 'linear-definition', label: 'linear', parentLabel: 'definition' },
                { segment: 'adaptive-instance', label: 'adaptive', parentLabel: 'instance' },
                { segment: 'linear-instance', label: 'linear', parentLabel: 'instance' },
                { segment: 'sandbox-definition', label: 'definition', parentLabel: 'sandboxes' },
                { segment: 'pool', label: 'pool' },
                { segment: 'images', label: 'images' },
                { segment: 'microservice', label: 'microservice' },
                { segment: 'group', label: 'group' },
                { segment: 'user', label: 'user' },
                { segment: 'run', label: 'run' },
            ];

            // Find best match (longest segment wins)
            let matchedLabel: string | null = null;
            let bestLen = 0;
            for (const { segment, label } of segmentToLabel) {
                if (urlLower.includes(segment) && segment.length > bestLen) {
                    matchedLabel = label;
                    bestLen = segment.length;
                }
            }

            if (!matchedLabel) return;

            // Find a/button whose visible text matches the label, with optional parent context
            const buttons = navDrawer.querySelectorAll<HTMLElement>('a.mdc-button, button.mdc-button');
            let activeBtn: HTMLElement | null = null;

            buttons.forEach((btn) => {
                const labelEl = btn.querySelector('.mdc-button__label');
                const text = labelEl?.textContent?.trim().toLowerCase() ?? '';
                if (text !== matchedLabel) return;

                // If parentLabel specified, verify the button is inside the right section
                const match = segmentToLabel.find(s => s.label === matchedLabel && urlLower.includes(s.segment));
                if (match?.parentLabel) {
                    // Walk up to find sentinel-root-agenda-container and check its header text
                    const rootContainer = btn.closest('sentinel-root-agenda-container');
                    const headerText = rootContainer
                        ?.querySelector('.container')?.textContent?.trim().toLowerCase() ?? '';
                    if (!headerText.includes(match.parentLabel)) return;
                }

                activeBtn = btn;
            });

            if (!activeBtn) return;

            activeBtn.classList.add('fctf-active');

            // Also highlight parent expand button if this is a nested item
            const agendaEl = (activeBtn as HTMLElement)
                .closest('sentinel-nested-agenda-container')
                ?.closest('sentinel-agenda-element');
            if (agendaEl) {
                const parentBtn = agendaEl.querySelector<HTMLElement>(
                    ':scope > div > button.mdc-button'
                );
                if (parentBtn && parentBtn !== activeBtn) {
                    parentBtn.classList.add('fctf-active');
                }
            }
        }, 150);
    }

    onLogin(): void {
        this.authService.login();
    }

    onLogout(): void {
        this.authService.logout();
    }

    private getTitleFromRouter(): Observable<string> {
        return this.router.events.pipe(
            filter((event) => event instanceof NavigationEnd),
            map(() => {
                let route = this.activatedRoute;
                while (route.firstChild) {
                    route = route.firstChild;
                }
                return route;
            }),
            filter((route) => route.outlet === 'primary'),
            map((route) => route.snapshot),
            map((snapshot) => snapshot.data['title']),
        );
    }

    private getSubtitleFromRouter(): Observable<string> {
        return this.router.events.pipe(
            filter((event) => event instanceof NavigationEnd),
            map(() => {
                let route = this.activatedRoute;
                while (route.firstChild) {
                    route = route.firstChild;
                }
                return route;
            }),
            filter((route) => route.outlet === 'primary'),
            map((route) => route.snapshot),
            map((snapshot) => snapshot.data['subtitle']),
        );
    }
}