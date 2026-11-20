import { injectable } from 'tsyringe';
import { parseBool } from '../../helpers';

@injectable()
export class DashboardConfigServiceCore {
  public dashboardUri = '/';

  get enabled(): boolean {
    const value = process.env.BUNWA_DASHBOARD_ENABLED || 'true';
    return parseBool(value);
  }

  get credentials(): [string, string] | null {
    const user = process.env.BUNWA_DASHBOARD_USERNAME || '';
    const password = process.env.BUNWA_DASHBOARD_PASSWORD || '';
    if (!user && !password) {
      return null;
    }
    if ((user && !password) || (!user && password)) {
      console.warn(
        'Set up both BUNWA_DASHBOARD_USERNAME and BUNWA_DASHBOARD_PASSWORD ' +
          'to enable dashboard authentication.',
      );
      return null;
    }
    return [user, password];
  }
}
