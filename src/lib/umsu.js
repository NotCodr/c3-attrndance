// UMSU compliance rules — hardcoded per spec section 8.

export const UMSU_RULES = {
  required_attendance_fields_for_grant_funded: [
    'full_name',
    'student_number',
    'course',
    'checked_in_at',
  ],
  grant_categories: ['Functions', 'Camps', 'Excursions', 'General'],
  per_person_funded_categories: ['Functions', 'Camps', 'Excursions'],
  electronic_attendance_substitute_acceptable: true,
  attendance_taken_at_event_only: true,
  minimum_photos_recommended: 3,
  minimum_receipts_required: 1,
  membership_min_for_affiliation: 30,
  membership_deadline: 'week 7 monday 9am of semester',
};

export const UNIVERSITY_OPTIONS = [
  { slug: 'unimelb', name: 'University of Melbourne', union: 'UMSU' },
];
