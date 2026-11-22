package emulator_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/emulator"
)

func TestClient_ListMethodsPaginationURLParity(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		query string
		page  emulator.PageRequest
		call  func(*emulator.Client, emulator.PageRequest) error
	}{
		{
			name:  "disciplines",
			path:  "/api/v1/disciplines",
			query: "limit=100&page=1",
			page:  emulator.PageRequest{Page: 1, Limit: 100},
			call: func(c *emulator.Client, page emulator.PageRequest) error {
				_, _, err := c.ListDisciplines(context.Background(), page)
				return err
			},
		},
		{
			name:  "debts",
			path:  "/api/v1/debts",
			query: "limit=100&page=1",
			page:  emulator.PageRequest{Page: 1, Limit: 100},
			call: func(c *emulator.Client, page emulator.PageRequest) error {
				_, _, err := c.ListDebts(context.Background(), page)
				return err
			},
		},
		{
			name:  "accounts with role",
			path:  "/api/v1/accounts",
			query: "limit=100&page=1&role=student",
			page:  emulator.PageRequest{Page: 1, Limit: 100},
			call: func(c *emulator.Client, page emulator.PageRequest) error {
				_, _, err := c.ListAccounts(context.Background(), "student", page)
				return err
			},
		},
		{
			name:  "accounts without role and signed values",
			path:  "/api/v1/accounts",
			query: "limit=0&page=-2",
			page:  emulator.PageRequest{Page: -2, Limit: 0},
			call: func(c *emulator.Client, page emulator.PageRequest) error {
				_, _, err := c.ListAccounts(context.Background(), "", page)
				return err
			},
		},
		{
			name:  "groups with signed and zero values",
			path:  "/api/v1/groups",
			query: "limit=-3&page=0",
			page:  emulator.PageRequest{Page: 0, Limit: -3},
			call: func(c *emulator.Client, page emulator.PageRequest) error {
				_, _, err := c.ListGroups(context.Background(), page)
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, tt.path, r.URL.Path)
				assert.Equal(t, tt.query, r.URL.RawQuery)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"data":[],"meta":{}}`))
			}))
			defer srv.Close()

			require.NoError(t, tt.call(emulator.New(srv.URL, "test-key"), tt.page))
		})
	}
}
