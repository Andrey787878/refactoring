package grade

// Grade represents an academic grade on the 2–5 scale.
type Grade struct {
	value int32
}

// Parse reports whether value is a valid grade.
func Parse(value int32) (Grade, bool) {
	if value < 2 || value > 5 {
		return Grade{}, false
	}
	return Grade{value: value}, true
}

// Int32 returns the numeric grade for storage and external APIs.
func (g Grade) Int32() int32 {
	return g.value
}
