// Re-export shared demo helpers from the Components folder so Pages/Demo/*
// files keep their existing import path. Inertia's page resolver scans
// Pages/**/*.jsx — names with a leading underscore aren't reachable as
// routes server-side because nothing maps to them.
export {
    default,
    DemoLayout,
    DemoLanguageDot,
    DemoModeBadge,
    DemoScorePill,
} from '@/Components/Demo';
