export interface ActivityHeatmapDayCell {
    date: string;
    formattedDate: string;
    count: number;
    level: number;
}
export interface ActivityHeatmapResult {
    categories: string[];
    milestoneDates: string[];
    totalActivities: number;
    days: string[];
    matrix: Record<string, ActivityHeatmapDayCell[]>;
}
