package changerequest

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/pgutil"
	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/repo/queries"
)

func TestSchedulePatchFromRequestJSON(t *testing.T) {
	id := pgutil.PgUUID(uuid.MustParse("01945370-11b1-7c20-a100-0a2f45eda151"))
	building, room, empty, notes := "Б", "201", "", "  Позвонить перед началом  "
	zero, duration := int32(0), int32(45)
	scheduledAt, err := time.Parse(time.RFC3339, "2027-02-17T14:30:00+05:00")
	require.NoError(t, err)
	date := pgtype.Timestamptz{Time: scheduledAt, Valid: true}

	for _, tc := range []struct {
		name      string
		input     string
		wantJSON  string
		hasChange bool
		want      queries.UpdateRetakeScheduleParams
	}{
		{name: "MissingFieldsKeepExistingSchedule", input: `{}`},
		{
			name:     "NullFieldsAreTreatedAsMissing",
			input:    `{"building":null,"room":null,"scheduled_at":null,"duration_minutes":null,"notes":null}`,
			wantJSON: `{}`,
		},
		{
			name:      "BuildingAndRoomAreTrimmedOnlyForTheUpdate",
			input:     `{"building":"  Б  ","room":" 201 "}`,
			hasChange: true,
			want:      queries.UpdateRetakeScheduleParams{Building: &building, Room: &room},
		},
		{
			name:      "ExplicitEmptyStringsStillUpdateColumns",
			input:     `{"building":"","room":"   ","notes":""}`,
			hasChange: true,
			want:      queries.UpdateRetakeScheduleParams{Building: &empty, Room: &empty, Notes: &empty},
		},
		{
			name:      "LegacySingleScheduleTimeKeepsTheOffset",
			input:     `{"scheduled_at":"2027-02-17T14:30:00+05:00"}`,
			hasChange: true,
			want:      queries.UpdateRetakeScheduleParams{ScheduledAt: date},
		},
		{
			name:      "ExplicitZeroDurationIsNotOmittedByTheMapper",
			input:     `{"duration_minutes":0}`,
			hasChange: true,
			want:      queries.UpdateRetakeScheduleParams{DurationMinutes: &zero},
		},
		{
			name:      "NotesPreserveWhitespace",
			input:     `{"notes":"  Позвонить перед началом  "}`,
			hasChange: true,
			want:      queries.UpdateRetakeScheduleParams{Notes: &notes},
		},
		{
			name:      "ProposedSlotsDoNotOnTheirOwnSetTheUpdateTimestamp",
			input:     `{"proposed_slots":["2027-02-17T14:30:00+05:00","2027-02-18T15:30:00+05:00"]}`,
			hasChange: true,
		},
		{
			name:      "AllFieldsAndProposedSlotsShareOneFlatJSON",
			input:     `{"building":"Б","room":"201","scheduled_at":"2027-02-17T14:30:00+05:00","duration_minutes":45,"notes":"  Позвонить перед началом  ","proposed_slots":["2027-02-17T14:30:00+05:00"]}`,
			hasChange: true,
			want: queries.UpdateRetakeScheduleParams{
				Building: &building, Room: &room, ScheduledAt: date, DurationMinutes: &duration, Notes: &notes,
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var changes Changes
			require.NoError(t, json.Unmarshal([]byte(tc.input), &changes))
			require.Equal(t, tc.hasChange, changes.hasAny())
			want := tc.want
			want.ID = id
			require.Equal(t, want, changes.Patch.UpdateParams(id))

			stored, err := json.Marshal(changes)
			require.NoError(t, err)
			wantJSON := tc.wantJSON
			if wantJSON == "" {
				wantJSON = tc.input
			}
			require.JSONEq(t, wantJSON, string(stored))
		})
	}
}
