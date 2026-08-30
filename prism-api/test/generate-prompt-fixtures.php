<?php

/**
 * Generates golden system-prompt fixtures straight from the Laravel job
 * classes, so the NestJS PromptBuilder is asserted against the real thing
 * rather than against a hand-copied approximation.
 *
 * buildSystemPrompt() reads no instance state, so the jobs can be reflected
 * without running their constructors (which would want real Eloquent models).
 *
 * Run from the repository root:
 *   php prism-api/test/generate-prompt-fixtures.php
 *
 * Re-run it whenever the Laravel prompts change; the Jest test will then fail
 * until the TypeScript side is updated to match.
 */

require __DIR__ . '/../../vendor/autoload.php';

$combinations = [
    'none'            => [],
    'php'             => ['PHP'],
    'javascript'      => ['JavaScript'],
    'typescript'      => ['TypeScript'],
    'python'          => ['Python'],
    'go'              => ['Go'],
    'ruby'            => ['Ruby'],
    'java'            => ['Java'],
    'ruby_java'       => ['Ruby', 'Java'],
    'php_javascript'  => ['PHP', 'JavaScript'],
    'js_ts'           => ['JavaScript', 'TypeScript'],
    'all_supported'   => ['PHP', 'JavaScript', 'TypeScript', 'Python', 'Go'],
    'mixed_unruled'   => ['Ruby', 'PHP', 'Java'],
];

$targets = [
    'commit'       => App\Jobs\ProcessCommitReview::class,
    'pull_request' => App\Jobs\ProcessPullRequestReview::class,
];

$fixtures = [];

foreach ($targets as $targetKey => $class) {
    $reflection = new ReflectionClass($class);
    $instance   = $reflection->newInstanceWithoutConstructor();

    $method = $reflection->getMethod('buildSystemPrompt');
    $method->setAccessible(true);

    foreach ($combinations as $name => $languages) {
        $fixtures[$targetKey][$name] = [
            'languages' => $languages,
            'prompt'    => $method->invoke($instance, $languages),
        ];
    }
}

$path = __DIR__ . '/fixtures/system-prompts.json';

if (! is_dir(dirname($path))) {
    mkdir(dirname($path), 0777, true);
}

file_put_contents(
    $path,
    json_encode($fixtures, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n"
);

printf("Wrote %d fixtures to %s\n", count($combinations) * count($targets), $path);
