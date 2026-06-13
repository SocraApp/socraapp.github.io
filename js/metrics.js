// Cognitive Metrics Module
class MetricsManager {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.chart = null;
  }

  async getLatestMetrics() {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return null;

    const { data, error } = await this.sb
      .from('cognitive_metrics')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Failed to fetch metrics:', error);
      return [];
    }
    return data || [];
  }

  async saveMetrics(metrics) {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return;

    const today = new Date().toISOString().split('T')[0];

    // Get existing metrics for today
    const { data: existing } = await this.sb
      .from('cognitive_metrics')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('date', today)
      .single();

    if (existing) {
      // Update with running averages
      const count = existing.session_count + 1;
      const update = {
        session_count: count,
        reasoning_quality: this.runningAvg(existing.reasoning_quality, metrics.reasoning_quality, count),
        logical_consistency: this.runningAvg(existing.logical_consistency, metrics.logical_consistency, count),
        completeness: this.runningAvg(existing.completeness, metrics.completeness, count),
        originality: this.runningAvg(existing.originality, metrics.originality, count),
        confidence_alignment: this.runningAvg(existing.confidence_alignment, metrics.confidence_alignment, count),
        avg_struggle_level: this.runningAvg(existing.avg_struggle_level, metrics.struggle_level, count),
      };

      // Track intervention types
      const interventions = existing.interventions_used || {};
      if (metrics.intervention_type) {
        interventions[metrics.intervention_type] = (interventions[metrics.intervention_type] || 0) + 1;
        update.interventions_used = interventions;
      }

      await this.sb
        .from('cognitive_metrics')
        .update(update)
        .eq('id', existing.id);
    } else {
      // Insert new
      const insert = {
        user_id: session.user.id,
        date: today,
        session_count: 1,
        reasoning_quality: metrics.reasoning_quality || 0,
        logical_consistency: metrics.logical_consistency || 0,
        completeness: metrics.completeness || 0,
        originality: metrics.originality || 0,
        confidence_alignment: metrics.confidence_alignment || 0,
        avg_struggle_level: metrics.struggle_level || 0,
        interventions_used: metrics.intervention_type ? { [metrics.intervention_type]: 1 } : {}
      };

      await this.sb
        .from('cognitive_metrics')
        .insert(insert);
    }
  }

  runningAvg(currentAvg, newValue, newCount) {
    if (!newValue) return currentAvg;
    return Math.round(((currentAvg * (newCount - 1)) + newValue) / newCount * 10) / 10;
  }

  async renderMetrics() {
    const metrics = await this.getLatestMetrics();
    if (!metrics || metrics.length === 0) {
      document.getElementById('metric-reasoning').textContent = '—';
      document.getElementById('metric-consistency').textContent = '—';
      document.getElementById('metric-completeness').textContent = '—';
      document.getElementById('metric-originality').textContent = '—';
      document.getElementById('metric-confidence').textContent = '—';
      document.getElementById('metric-sessions').textContent = '0';
      document.getElementById('metric-struggle').textContent = '—';
      return;
    }

    const latest = metrics[0];

    // Update metric values
    const fields = {
      reasoning: 'reasoning_quality',
      consistency: 'logical_consistency',
      completeness: 'completeness',
      originality: 'originality',
      confidence: 'confidence_alignment'
    };

    Object.entries(fields).forEach(([key, field]) => {
      const val = latest[field] || 0;
      document.getElementById('metric-' + key).textContent = val.toFixed(1);
      document.getElementById('bar-' + key).style.width = (val * 10) + '%';
    });

    document.getElementById('metric-sessions').textContent = latest.session_count || 0;
    document.getElementById('metric-struggle').textContent =
      latest.avg_struggle_level ? latest.avg_struggle_level.toFixed(1) : '—';

    // Render chart
    this.renderChart(metrics);
  }

  renderChart(metrics) {
    const canvas = document.getElementById('metrics-chart');
    if (!canvas) return;

    // Reverse to get chronological order
    const data = [...metrics].reverse();
    const labels = data.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const datasets = [
      {
        label: 'Reasoning Quality',
        data: data.map(d => d.reasoning_quality),
        borderColor: '#4A5D4E',
        backgroundColor: 'rgba(74, 93, 78, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      },
      {
        label: 'Logical Consistency',
        data: data.map(d => d.logical_consistency),
        borderColor: '#273944',
        backgroundColor: 'rgba(39, 57, 68, 0.1)',
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      },
      {
        label: 'Originality',
        data: data.map(d => d.originality),
        borderColor: '#47331e',
        backgroundColor: 'rgba(71, 51, 30, 0.1)',
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      }
    ];

    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 10,
            grid: {
              color: '#F1F1F1',
            },
            ticks: {
              font: { family: 'Inter', size: 11 },
              color: '#73787b'
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { family: 'Inter', size: 11 },
              color: '#73787b'
            }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Inter', size: 12 },
              color: '#43474b',
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 16
            }
          }
        }
      }
    });
  }
}

window.MetricsManager = MetricsManager;
