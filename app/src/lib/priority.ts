import type { Job, PriorityRule, RankingScoreResult, UrgencyLevel, Dealership, Service } from '@/types';

/**
 * Calculates a dynamic ranking score for a job based on dealership-specific rules.
 * 
 * Rules Logic:
 * 1. Base Score: LOW (1), MEDIUM (5), HIGH (10), CRITICAL (20)
 * 2. Rule 1: High Urgency -> Score += 10
 * 3. Rule 2: Premium Vehicle -> Score += 8
 * 4. Rule 3: Dealership Preference overrides or adds to logic.
 */
export function calculateJobRanking(
    jobData: {
        dealershipId: string;
        serviceId: string;
        urgency: UrgencyLevel;
        vehicleMake?: string;
    },
    dealershipRules: PriorityRule[]
): RankingScoreResult {
    let score = 0;
    let finalUrgency = jobData.urgency;
    const appliedRules: string[] = [];

    // 1. Initial Base Score from Input Urgency
    const urgencyWeight: Record<UrgencyLevel, number> = {
        'LOW': 1,
        'MEDIUM': 5,
        'HIGH': 10,
        'CRITICAL': 20
    };

    score += urgencyWeight[jobData.urgency];

    // 2. Default Priority Rule 1: If urgency is HIGH or CRITICAL, add 10
    if (jobData.urgency === 'HIGH' || jobData.urgency === 'CRITICAL') {
        score += 10;
        appliedRules.push('Urgency Ranking');
    }

    // 3. Default Priority Rule 2: If vehicle is Premium (Audi, BMW, etc.), add 8
    const premiumMakes = ['Audi', 'BMW', 'Mercedes-Benz', 'Porsche', 'Lexus'];
    if (jobData.vehicleMake && premiumMakes.includes(jobData.vehicleMake)) {
        score += 8;
        appliedRules.push(`Premium Vehicle (${jobData.vehicleMake})`);

        // As per documentation: Any job for an "Audi" vehicle must trigger a HIGH urgency flag
        if (jobData.vehicleMake === 'Audi' && finalUrgency !== 'CRITICAL') {
            finalUrgency = 'HIGH';
            appliedRules.push('Audi Escalation');
        }
    }

    // 4. Rule 3: Apply Dealership-specific rules
    const activeRules = dealershipRules.filter(r => r.isActive && r.dealershipId === jobData.dealershipId);

    for (const rule of activeRules) {
        let match = true;

        // Optional Service Match
        if (rule.serviceId && rule.serviceId !== jobData.serviceId) match = false;

        // Optional Vehicle Make Match
        if (rule.vehicleMake && rule.vehicleMake !== jobData.vehicleMake) match = false;

        // Optional Urgency Match
        if (rule.urgencyMatch && rule.urgencyMatch !== jobData.urgency) match = false;

        if (match) {
            score += rule.rankingScore;
            appliedRules.push(rule.description);

            // Override urgency if target is higher
            const urgencyLevels: UrgencyLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
            if (urgencyLevels.indexOf(rule.targetUrgency) > urgencyLevels.indexOf(finalUrgency)) {
                finalUrgency = rule.targetUrgency;
            }
        }
    }

    return {
        score,
        finalUrgency,
        appliedRules
    };
}

/**
 * Sorts a list of jobs based on their ranking score.
 */
export function sortJobsByRanking(
    jobs: Job[],
    allRules: PriorityRule[]
): Job[] {
    const jobScores = new Map<string, number>();

    jobs.forEach(job => {
        const result = calculateJobRanking({
            dealershipId: job.dealershipId,
            serviceId: job.serviceId,
            urgency: job.urgency,
            vehicleMake: job.vehicle?.make
        }, allRules);

        jobScores.set(job.id, result.score);

        // Update job priority in real-time for sorting if needed
        // In a real app, this might be saved to DB
    });

    return [...jobs].sort((a, b) => (jobScores.get(b.id) || 0) - (jobScores.get(a.id) || 0));
}

