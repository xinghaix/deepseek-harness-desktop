package desktopstate

// NotificationPrefs 只保存应用偏好，不保存操作系统授权状态。
type NotificationPrefs struct {
	Enabled     bool `json:"enabled"`
	Question    bool `json:"question"`
	Approval    bool `json:"approval"`
	Completed   bool `json:"completed"`
	Interrupted bool `json:"interrupted"`
	Error       bool `json:"error"`
	ShowTitle   bool `json:"showTitle"`
}

func (p Prefs) EffectiveNotifications() NotificationPrefs {
	if p.Notifications != nil {
		return *p.Notifications
	}
	return NotificationPrefs{Question: true, Approval: true, Completed: true, Interrupted: true, Error: true}
}

func (p *NotificationPrefs) Set(key string, value bool) bool {
	switch key {
	case "enabled":
		p.Enabled = value
	case "question":
		p.Question = value
	case "approval":
		p.Approval = value
	case "completed":
		p.Completed = value
	case "interrupted":
		p.Interrupted = value
	case "error":
		p.Error = value
	case "showTitle":
		p.ShowTitle = value
	default:
		return false
	}
	return true
}

func (p NotificationPrefs) Allows(kind string) bool {
	if !p.Enabled {
		return false
	}
	switch kind {
	case "question", "plan-review":
		return p.Question
	case "approval":
		return p.Approval
	case "completed":
		return p.Completed
	case "interrupted":
		return p.Interrupted
	case "error":
		return p.Error
	default:
		return false
	}
}
