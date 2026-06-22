import { injectable } from 'tsyringe';
import { parseBool } from '../../helpers';

@injectable()
export class DashboardConfigServiceCore {
  public dashboardUri = '/dashboard';

  get enabled(): boolean {
    const value = process.env.WAHA_DASHBOARD_ENABLED || 'true';
    return parseBool(value);
  }

  get credentials(): [string, string] | null {
    const user = process.env.WAHA_DASHBOARD_USERNAME || '';
    const password = process.env.WAHA_DASHBOARD_PASSWORD || '';
    if (!user && !password) {
      return null;
    }
    if ((user && !password) || (!user && password)) {
      console.warn(
        'Set up both WAHA_DASHBOARD_USERNAME and WAHA_DASHBOARD_PASSWORD ' +
          'to enable dashboard authentication.',
      );
      return null;
    }
    return [user, password];
  }
}
