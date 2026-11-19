// Package retakeschedule describes partial changes to a retake's schedule.
package retakeschedule

import (
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/repo/queries"
)

// Patch holds the schedule fields that can be changed. Nil leaves a field unchanged.
type Patch struct {
	Building        *string    `json:"building,omitempty"`
	Room            *string    `json:"room,omitempty"`
	ScheduledAt     *time.Time `json:"scheduled_at,omitempty"`
	DurationMinutes *int32     `json:"duration_minutes,omitempty"`
	Notes           *string    `json:"notes,omitempty"`
}

func (p Patch) HasChanges() bool {
	return p.Building != nil || p.Room != nil || p.ScheduledAt != nil ||
		p.DurationMinutes != nil || p.Notes != nil
}

// UpdateParams converts changes to the nullable parameters used by sqlc.
func (p Patch) UpdateParams(id pgtype.UUID) queries.UpdateRetakeScheduleParams {
	params := queries.UpdateRetakeScheduleParams{ID: id, DurationMinutes: p.DurationMinutes, Notes: p.Notes}
	if p.Building != nil {
		building := strings.TrimSpace(*p.Building)
		params.Building = &building
	}
	if p.Room != nil {
		room := strings.TrimSpace(*p.Room)
		params.Room = &room
	}
	if p.ScheduledAt != nil {
		params.ScheduledAt = pgtype.Timestamptz{Time: *p.ScheduledAt, Valid: true}
	}
	return params
}
