/** Simple line icons of the views (24×24, stroke = currentColor), shared by the sidebar and Help. */
export const VIEW_ICONS = {
  calendar:
    'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4',
  load: 'M5 20V11M10 20V5M15 20v-7M20 20V8',
  meetings: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  templates: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 16.5h7M16.5 13v7',
  exchange: 'M7 7h13l-4-4M17 17H4l4 4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
} as const;

export type ViewId = keyof typeof VIEW_ICONS;

/** The area's page has the area marker (layers), not the people of a team. */
export const AREA_ICON = 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4';
