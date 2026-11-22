package emulator

import (
	"context"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/require"
)

type gradeSenderFunc func(context.Context, string, Grade, *string, string) error

func (send gradeSenderFunc) PatchDebtGrade(ctx context.Context, id string, grade Grade, comment *string, key string) error {
	return send(ctx, id, grade, comment, key)
}

func TestSendGradeAsync(t *testing.T) {
	t.Run("sends the expected grade once", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			var calls int
			var gotID, gotKey string
			var gotGrade Grade
			var gotComment *string
			var deadline time.Time
			var hasDeadline bool
			sender := gradeSenderFunc(func(ctx context.Context, id string, grade Grade, comment *string, key string) error {
				calls++
				gotID, gotGrade, gotComment, gotKey = id, grade, comment, key
				deadline, hasDeadline = ctx.Deadline()
				return nil
			})
			externalID := "external-12"
			expectedDeadline := time.Now().Add(30 * time.Second)
			SendGradeAsync(sender, &externalID, "local-34", 5, "debt")
			synctest.Wait()
			require.Equal(t, 1, calls)
			require.Equal(t, "external-12", gotID)
			require.Equal(t, Grade{Type: "numeric", Value: 5}, gotGrade)
			require.Nil(t, gotComment)
			require.Equal(t, "debt-grade-external-12-5", gotKey)
			require.True(t, hasDeadline)
			require.Equal(t, expectedDeadline, deadline)
		})
	})
	t.Run("skips grades without an external ID", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			calls := 0
			sender := gradeSenderFunc(func(context.Context, string, Grade, *string, string) error {
				calls++
				return nil
			})
			SendGradeAsync(sender, nil, "local-34", 5, "statement")
			synctest.Wait()
			require.Zero(t, calls)
		})
	})
}
