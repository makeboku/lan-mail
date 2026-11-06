import React from "react";
import { useTranslation } from "react-i18next";
import Container from "./Container";

// 定义 props 类型，允许父组件传递控制弹窗显示的函数
interface FooterProps {
  onShowInfo: (infoType: "privacy" | "terms") => void;
}

const Footer: React.FC<FooterProps> = ({ onShowInfo }) => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t py-8 mt-8 bg-card/50">
      <Container>
        <div className="text-center text-sm text-muted-foreground">
          <p className="mb-3">
            © {year} {t("app.title")}
          </p>

          <div className="flex flex-wrap justify-center items-center gap-4">
            <button
              onClick={() => onShowInfo("privacy")}
              className="hover:text-primary transition-colors font-medium"
            >
              {t("common.privacyPolicy", "隐私政策")}
            </button>
            <button
              onClick={() => onShowInfo("terms")}
              className="hover:text-primary transition-colors font-medium"
            >
              {t("common.terms", "使用条款")}
            </button>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
