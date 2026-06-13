class MetricsManager {
  constructor(supabaseClient) { this.sb = supabaseClient; }
  async saveMetrics(metrics) {
    const {data:{session}} = await this.sb.auth.getSession();
    if (!session) return;
    const today = new Date().toISOString().split('T')[0];
    const {data:existing} = await this.sb.from('cognitive_metrics').select('*').eq('user_id',session.user.id).eq('date',today).single();
    if (existing) {
      const c = existing.session_count+1;
      const u = { session_count:c,
        reasoning_quality:this.avg(existing.reasoning_quality,metrics.reasoning_quality,c),
        logical_consistency:this.avg(existing.logical_consistency,metrics.logical_consistency,c),
        completeness:this.avg(existing.completeness,metrics.completeness,c),
        originality:this.avg(existing.originality,metrics.originality,c),
        confidence_alignment:this.avg(existing.confidence_alignment,metrics.confidence_alignment,c),
        avg_struggle_level:this.avg(existing.avg_struggle_level,metrics.struggle_level,c)
      };
      const iv = existing.interventions_used||{};
      if(metrics.intervention_type){iv[metrics.intervention_type]=(iv[metrics.intervention_type]||0)+1;u.interventions_used=iv;}
      await this.sb.from('cognitive_metrics').update(u).eq('id',existing.id);
    } else {
      await this.sb.from('cognitive_metrics').insert({
        user_id:session.user.id,date:today,session_count:1,
        reasoning_quality:metrics.reasoning_quality||0,logical_consistency:metrics.logical_consistency||0,
        completeness:metrics.completeness||0,originality:metrics.originality||0,
        confidence_alignment:metrics.confidence_alignment||0,avg_struggle_level:metrics.struggle_level||0,
        interventions_used:metrics.intervention_type?{[metrics.intervention_type]:1}:{}
      });
    }
  }
  avg(c,v,n){if(!v)return c;return Math.round(((c*(n-1))+v)/n*10)/10;}
}
window.MetricsManager = MetricsManager;
