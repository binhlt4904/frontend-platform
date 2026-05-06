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
        // Run after DOM settles
        setTimeout(() => {
            const navDrawer = document.querySelector('.nav-drawer');
            if (!navDrawer) return;

            // Remove all existing active marks
            navDrawer.querySelectorAll('.fctf-active').forEach((el) => {
                el.classList.remove('fctf-active');
            });

            // Find all nav buttons
            const buttons = navDrawer.querySelectorAll<HTMLElement>('button.mdc-button');
            let bestMatch: { el: HTMLElement; length: number } | null = null;

            buttons.forEach((btn) => {
                // Get the tooltip (matTooltip) or label text as route hint
                const label = btn.querySelector('.mdc-button__label')?.textContent?.trim().toLowerCase() ?? '';
                const tooltip = btn.getAttribute('ng-reflect-message')?.toLowerCase() ?? '';
                const hint = tooltip || label;

                // Map label → route segment
                const routeMap: Record<string, string> = {
                    'definition': 'definition',
                    'instance': 'instance',
                    'run': 'run',
                    'pool': 'pool',
                    'images': 'images',
                    'user': 'user',
                    'group': 'group',
                    'microservice': 'microservice',
                    'adaptive': 'adaptive',
                    'linear': 'linear',
                };

                for (const [key, segment] of Object.entries(routeMap)) {
                    if (hint.includes(key)) {
                        const urlLower = currentUrl.toLowerCase();
                        if (urlLower.includes(segment)) {
                            const matchLength = segment.length;
                            if (!bestMatch || matchLength > bestMatch.length) {
                                bestMatch = { el: btn, length: matchLength };
                            }
                        }
                    }
                }
            });

            if (bestMatch) {
                (bestMatch as { el: HTMLElement; length: number }).el.classList.add('fctf-active');

                // Also mark parent sentinel-nested-agenda-container button if nested
                const container = (bestMatch as { el: HTMLElement }).el.closest('sentinel-nested-agenda-container');
                if (container) {
                    const parentBtn = container.closest('sentinel-agenda-element')
                        ?.querySelector<HTMLElement>(':scope > div > button');
                    if (parentBtn) {
                        parentBtn.classList.add('fctf-active');
                    }
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