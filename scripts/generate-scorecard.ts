import * as path from 'node:path';
import { generateScorecardFromSummary } from '../fixtures/validation-scorecard';

const defaultArtifactsDir = path.resolve(__dirname, '..', 'artifacts');
const summaryPath = path.resolve(process.argv[2] ?? path.join(defaultArtifactsDir, 'latest-validation-summary.json'));
const outDir = path.resolve(process.argv[3] ?? path.dirname(summaryPath));

const { jsonPath, mdPath, scorecard } = generateScorecardFromSummary(summaryPath, outDir);

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(
  `Coverage ${scorecard.overall.validationCoveragePercent}% (${scorecard.overall.executedValidationCount}/${scorecard.overall.expectedValidationCount}); grade ${scorecard.overall.validationQualityGrade}`,
);
