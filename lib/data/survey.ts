/**
 * Data-access layer for SurveyResponse (post-visit patient feedback).
 * DIRECTLY_SCOPED_MODEL — wait, actually SurveyResponse IS listed in
 * DIRECTLY_SCOPED_MODELS (lib/prisma-tenant-extension.ts). Every function
 * assumes the caller has already established tenant context via
 * runWithTenant/runAsSystem. The feedback/[token] route resolves the survey
 * via Visit.feedbackToken (a public/unauthenticated flow), so it must run
 * under runAsSystem() since there's no session-derived tenant yet.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function toSurveyResponseDTO(s: Prisma.SurveyResponseGetPayload<{}>) {
  return { _id: s.id, ...s };
}

export interface CreateSurveyResponseInput {
  visitId: string;
  patientId?: string;
  overallRating: number;
  doctorRating?: number;
  staffRating?: number;
  facilityRating?: number;
  waitTimeRating?: number;
  comments?: string;
  wouldRecommend?: boolean;
  ipAddress?: string;
  tenantId?: string;
}

export async function createSurveyResponse(input: CreateSurveyResponseInput) {
  const survey = await prisma.surveyResponse.create({
    data: {
      visitId: input.visitId,
      patientId: input.patientId,
      overallRating: input.overallRating,
      doctorRating: input.doctorRating,
      staffRating: input.staffRating,
      facilityRating: input.facilityRating,
      waitTimeRating: input.waitTimeRating,
      comments: input.comments,
      wouldRecommend: input.wouldRecommend,
      ipAddress: input.ipAddress,
      submittedAt: new Date(),
    },
  });
  return toSurveyResponseDTO(survey);
}

export async function getSurveyResponseByVisitId(visitId: string) {
  const survey = await prisma.surveyResponse.findUnique({ where: { visitId } });
  return survey ? toSurveyResponseDTO(survey) : null;
}
