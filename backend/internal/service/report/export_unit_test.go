package report_test

import (
	"bytes"
	"encoding/csv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/service/report"
)

func TestReport_ExportRetakes_TableContent(t *testing.T) {
	headers := []string{
		"Дата проведения", "Дисциплина (код)", "Дисциплина", "Тип",
		"Корпус", "Аудитория", "Продолжительность (мин)", "Студент (ФИО)",
		"Группа", "Email студента", "Оценка", "Преподаватели",
	}
	group := "ИВТ-21"
	cases := []struct {
		name string
		rows []report.RetakeReportRow
		want [][]string
	}{
		{
			name: "EmptyReportHasOnlyHeaders",
		},
		{
			name: "EveryValueMatchesItsColumn",
			rows: []report.RetakeReportRow{{
				CompletedAt:     time.Date(2026, 5, 20, 14, 30, 0, 0, time.FixedZone("UTC+5", 5*60*60)),
				DisciplineCode:  "MATH-101",
				DisciplineName:  "Математика",
				Kind:            "commission",
				Building:        "Б",
				Room:            "201",
				DurationMinutes: 90,
				Students: []report.ParticipantInfo{{
					FullName: "Иванов Иван", GroupName: &group, Email: "ivan@example.test", Grade: int32Ptr(5),
				}},
				Teachers: []report.ParticipantInfo{{FullName: "Петров Пётр"}},
			}},
			want: [][]string{{
				"2026-05-20 14:30", "MATH-101", "Математика", "commission", "Б", "201",
				"90", "Иванов Иван", "ИВТ-21", "ivan@example.test", "5", "Петров Пётр",
			}},
		},
		{
			name: "RetakesAndStudentsKeepInputOrder",
			rows: []report.RetakeReportRow{
				{DisciplineCode: "B", Students: []report.ParticipantInfo{{FullName: "Яков"}, {FullName: "Анна"}}},
				{DisciplineCode: "A", Students: []report.ParticipantInfo{{FullName: "Павел"}}},
			},
			want: [][]string{
				{"", "B", "", "", "", "", "0", "Яков", "", "", "", ""},
				{"", "B", "", "", "", "", "0", "Анна", "", "", "", ""},
				{"", "A", "", "", "", "", "0", "Павел", "", "", "", ""},
			},
		},
		{
			name: "RetakeWithoutStudentsStillProducesOneRow",
			rows: []report.RetakeReportRow{{
				DisciplineCode: "PHYS", DurationMinutes: 45,
				Students: []report.ParticipantInfo{},
				Teachers: []report.ParticipantInfo{{FullName: "Ирина"}},
			}},
			want: [][]string{{"", "PHYS", "", "", "", "", "45", "", "", "", "", "Ирина"}},
		},
		{
			name: "MissingGroupAndGradeAreIndependent",
			rows: []report.RetakeReportRow{{
				Students: []report.ParticipantInfo{
					{FullName: "Анна", GroupName: &group},
					{FullName: "Павел", Grade: int32Ptr(4)},
				},
			}},
			want: [][]string{
				{"", "", "", "", "", "", "0", "Анна", "ИВТ-21", "", "", ""},
				{"", "", "", "", "", "", "0", "Павел", "", "", "4", ""},
			},
		},
		{
			name: "ZeroGradeDiffersFromMissingGrade",
			rows: []report.RetakeReportRow{{
				Students: []report.ParticipantInfo{
					{FullName: "Анна", Grade: int32Ptr(0)},
					{FullName: "Павел"},
				},
			}},
			want: [][]string{
				{"", "", "", "", "", "", "0", "Анна", "", "", "0", ""},
				{"", "", "", "", "", "", "0", "Павел", "", "", "", ""},
			},
		},
		{
			name: "TeachersShareOneCellInInputOrder",
			rows: []report.RetakeReportRow{{
				Teachers: []report.ParticipantInfo{{FullName: "Яков"}, {FullName: "Анна"}},
			}},
			want: [][]string{{"", "", "", "", "", "", "0", "", "", "", "", "Яков, Анна"}},
		},
		{
			name: "PunctuationAndNewlinesStayInsideOneCell",
			rows: []report.RetakeReportRow{{
				DisciplineName: "Практикум, \"Основы\"\nЧасть 2",
			}},
			want: [][]string{{"", "", "Практикум, \"Основы\"\nЧасть 2", "", "", "", "0", "", "", "", "", ""}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, format := range []report.ExportFormat{report.FormatCSV, report.FormatXLSX} {
				t.Run(string(format), func(t *testing.T) {
					body, err := report.ExportRetakes(tc.rows, format)
					require.NoError(t, err)
					want := append([][]string{headers}, tc.want...)
					require.Equal(t, want, readExportTable(t, body, format, len(headers)))
				})
			}
		})
	}
}

func readExportTable(t *testing.T, body []byte, format report.ExportFormat, width int) [][]string {
	t.Helper()
	if format == report.FormatCSV {
		csvBody, hasBOM := bytes.CutPrefix(body, []byte("\ufeff"))
		require.True(t, hasBOM, "CSV must start with a UTF-8 BOM")
		rows, err := csv.NewReader(bytes.NewReader(csvBody)).ReadAll()
		require.NoError(t, err)
		return rows
	}

	book, err := excelize.OpenReader(bytes.NewReader(body))
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, book.Close()) })
	require.Equal(t, []string{"Пересдачи"}, book.GetSheetList())

	rows, err := book.GetRows("Пересдачи")
	require.NoError(t, err)
	for i, row := range rows {
		require.LessOrEqual(t, len(row), width, "unexpected columns in XLSX row %d", i+1)
		// Excelize omits trailing empty cells. Restore their positions for comparison.
		if len(row) < width {
			cells := make([]string, width)
			copy(cells, row)
			rows[i] = cells
		}
	}
	return rows
}
